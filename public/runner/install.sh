#!/usr/bin/env bash
# Forge runner installer for Ubuntu 22.04/24.04 (Oracle Cloud Ampere A1 free tier recommended).
# Usage: curl -fsSL https://<your-forge>/runner/install.sh | sudo FORGE_URL=https://<your-forge> bash
set -euo pipefail
FORGE_URL="${FORGE_URL:-https://pixel-perfect-replay-15052.lovable.app}"
MODEL="${FORGE_MODEL:-qwen2.5-coder:7b}"
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }
ARCH=$(dpkg --print-architecture)

echo "==> Installing Docker, Node.js and tools"
apt-get update -y
apt-get install -y ca-certificates curl git docker.io jq
systemctl enable --now docker
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
fi

echo "==> Installing Cloudflare tunnel (free, no open ports needed)"
curl -fsSL -o /usr/local/bin/cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}"
chmod +x /usr/local/bin/cloudflared

echo "==> Building the workspace image"
mkdir -p /opt/forge-runner /etc/forge-runner
cat > /opt/forge-runner/Dockerfile <<'EOF'
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git curl psmisc iproute2 procps python3 build-essential && rm -rf /var/lib/apt/lists/* \
 && corepack enable && npm i -g bun pnpm@9 || true
RUN useradd -m -s /bin/bash user || true
USER user
WORKDIR /home/user
EOF
docker build -t forge-box:latest /opt/forge-runner

curl -fsSL "$FORGE_URL/runner/forge-runner.mjs" -o /opt/forge-runner/forge-runner.mjs
if [ ! -f /etc/forge-runner/config.json ]; then
  SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 64)
  MEM_GB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1024 / 1024 ))
  MAXB=$(( MEM_GB > 8 ? (MEM_GB - 6) / 3 : 1 ))
  jq -n --arg s "$SECRET" --arg f "$FORGE_URL" --argjson m "$MAXB" '{secret:$s, forgeUrl:$f, port:7878, maxBoxes:$m, boxMemory:"3g", boxCpus:1}' > /etc/forge-runner/config.json
  chmod 600 /etc/forge-runner/config.json
fi

cat > /opt/forge-runner/tunnel.sh <<'EOF'
#!/usr/bin/env bash
# Starts a quick tunnel and records its public HTTPS address for heartbeats.
/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:7878 2>&1 | while IFS= read -r line; do
  echo "$line"
  url=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' || true)
  [ -n "$url" ] && echo "$url" > /etc/forge-runner/endpoint
done
EOF
chmod +x /opt/forge-runner/tunnel.sh

cat > /etc/systemd/system/forge-runner.service <<'EOF'
[Unit]
Description=Forge runner
After=docker.service network-online.target
Requires=docker.service
[Service]
ExecStart=/usr/bin/node /opt/forge-runner/forge-runner.mjs
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/forge-tunnel.service <<'EOF'
[Unit]
Description=Forge runner tunnel
After=network-online.target forge-runner.service
[Service]
ExecStart=/opt/forge-runner/tunnel.sh
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

echo "==> Installing the free local AI model ($MODEL) — this download can take a while"
command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh
systemctl enable --now ollama || true
(ollama pull "$MODEL" >/var/log/forge-ollama-pull.log 2>&1 &) || true

systemctl daemon-reload
systemctl enable --now forge-runner forge-tunnel
echo "==> Waiting for the public address"
for i in $(seq 1 60); do [ -s /etc/forge-runner/endpoint ] && break; sleep 2; done
[ -s /etc/forge-runner/endpoint ] || { echo "Tunnel did not start. Check: journalctl -u forge-tunnel"; exit 1; }
echo
echo "Your pairing code (paste it into Forge -> Settings -> Your server):"
echo
node /opt/forge-runner/forge-runner.mjs --pairing-code
echo
