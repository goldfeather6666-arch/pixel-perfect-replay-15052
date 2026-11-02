// Forge runner: runs Forge agent workspaces, previews and keepers on your own server (e.g. Oracle free tier).
// Zero dependencies (Node 20+, Docker). Every Forge request is HMAC-signed with your pairing secret.
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";

const CFG = JSON.parse(fs.readFileSync(process.env.FORGE_RUNNER_CONFIG || "/etc/forge-runner/config.json", "utf8"));
const PORT = Number(CFG.port || 7878);
const MAX_BOXES = Number(CFG.maxBoxes || 6);
const IMAGE = CFG.image || "forge-box:latest";
const SKEW = 5 * 60_000;
const boxes = new Map(); // id -> { expires, traffic, ip }

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (m) => crypto.createHmac("sha256", CFG.secret).update(m).digest("hex");
const keyId = sha(`forge-runner:${CFG.secret}`).slice(0, 20);
const ollamaKey = hmac("forge-ollama");

function verify(req, path, body) {
  const ts = String(req.headers["x-forge-ts"] || ""), sig = String(req.headers["x-forge-signature"] || "");
  if (!ts || Math.abs(Date.now() - Number(ts)) > SKEW) return false;
  const exp = hmac(`${req.method}\n${path}\n${ts}\n${sha(body)}`);
  return sig.length === exp.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
}

function run(cmd, args, { timeoutMs = 60_000, input } = {}) {
  return new Promise((resolve) => {
    const p = execFile(cmd, args, { timeout: timeoutMs || 0, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ exitCode: err ? (typeof err.code === "number" ? err.code : -1) : 0, stdout: String(stdout), stderr: String(stderr || (err && !err.code ? err.message : "")) }));
    if (input !== undefined) { p.stdin.end(input); }
  });
}

const name = (b) => `forge-${b}`;
const validBox = (b) => /^[a-z0-9-]{6,64}$/.test(b) && boxes.has(b);
const validPath = (p) => typeof p === "string" && p.startsWith("/") && !p.includes("\0") && p.length < 1024;

async function createBox(ttlMs) {
  if (boxes.size >= MAX_BOXES) throw Object.assign(new Error("full"), { status: 503 });
  const b = crypto.randomBytes(8).toString("hex");
  const r = await run("docker", ["run", "-d", "--name", name(b), "--hostname", "forge", "--memory", CFG.boxMemory || "6g", "--cpus", String(CFG.boxCpus || 2),
    "--pids-limit", "1024", "--security-opt", "no-new-privileges", "--cap-drop", "ALL", "--cap-add", "CHOWN", "--cap-add", "SETUID", "--cap-add", "SETGID", "--cap-add", "DAC_OVERRIDE", "--cap-add", "FOWNER", "--cap-add", "KILL",
    "--network", "forge-net", "--label", "forge.box=1", IMAGE, "sleep", "infinity"], { timeoutMs: 120_000 });
  if (r.exitCode !== 0) throw new Error("docker run failed: " + r.stderr.slice(0, 300));
  const ip = (await run("docker", ["inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", name(b)])).stdout.trim();
  boxes.set(b, { expires: Date.now() + (ttlMs || 15 * 60_000), traffic: crypto.randomBytes(24).toString("hex"), ip });
  return b;
}

async function destroy(b) { boxes.delete(b); await run("docker", ["rm", "-f", name(b)], { timeoutMs: 30_000 }); }

async function exec(b, { cmd, cwd, envs, timeoutMs, background }) {
  const args = ["exec", "-i", "-u", "user"];
  if (cwd && validPath(cwd)) args.push("-w", cwd);
  for (const [k, v] of Object.entries(envs || {})) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) args.push("-e", `${k}=${v}`);
  if (background) {
    const r = await run("docker", [...args, name(b), "bash", "-c", `nohup bash -c "$0" >/dev/null 2>&1 & echo $!`, cmd], { timeoutMs: 20_000 });
    return { exitCode: r.exitCode, stdout: "", stderr: r.stderr, pid: Number(r.stdout.trim()) || 0 };
  }
  return run("docker", [...args, name(b), "bash", "-lc", cmd], { timeoutMs: Math.min(timeoutMs || 60_000, 600_000) });
}

async function capacity() {
  const mem = fs.readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+)/);
  return { boxes: boxes.size, free_slots: Math.max(0, MAX_BOXES - boxes.size), mem_free_mb: mem ? Math.round(Number(mem[1]) / 1024) : 0, load: Number(fs.readFileSync("/proc/loadavg", "utf8").split(" ")[0]) };
}

async function api(req, res, path, body) {
  if (!verify(req, path, body)) return send(res, 401, { error: "unauthorized" });
  const data = body ? JSON.parse(body) : {};
  if (path === "/v1/health") return send(res, 200, { ok: true, capacity: await capacity() });
  if (path === "/v1/boxes") { const b = await createBox(data.ttlMs); return send(res, 200, { box: b, traffic: boxes.get(b).traffic }); }
  const m = /^\/v1\/boxes\/([a-z0-9-]+)\/(exec|touch|destroy|files\/write|files\/remove|files\/read)$/.exec(path);
  if (!m || !validBox(m[1])) return send(res, 404, { error: "no such workspace" });
  const [, b, op] = m;
  const box = boxes.get(b);
  if (op === "touch") { box.expires = Date.now() + Math.min(Number(data.ttlMs) || 15 * 60_000, 2 * 3600_000); return send(res, 200, { ok: true, traffic: box.traffic }); }
  if (op === "destroy") { await destroy(b); return send(res, 200, { ok: true }); }
  box.expires = Math.max(box.expires, Date.now() + 5 * 60_000);
  if (op === "exec") return send(res, 200, await exec(b, data));
  if (!validPath(data.path)) return send(res, 400, { error: "bad path" });
  if (op === "files/write") {
    const r = await run("docker", ["exec", "-i", "-u", "user", name(b), "bash", "-c", 'mkdir -p "$(dirname "$0")" && cat > "$0"', data.path], { input: String(data.content ?? "") });
    return send(res, r.exitCode === 0 ? 200 : 500, r);
  }
  if (op === "files/remove") { await run("docker", ["exec", "-u", "user", name(b), "rm", "-rf", "--", data.path]); return send(res, 200, { ok: true }); }
  const r = await run("docker", ["exec", "-u", "user", name(b), "cat", "--", data.path]);
  return send(res, 200, { content: r.stdout });
}

function send(res, status, obj) { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); }

function previewTarget(url, headers) {
  const m = /^\/__preview\/([a-z0-9-]+)\/(\d{2,5})(\/.*)?$/.exec(url.split("?")[0]);
  if (!m || !validBox(m[1])) return null;
  const box = boxes.get(m[1]);
  const tok = String(headers["e2b-traffic-access-token"] || "");
  if (tok.length !== box.traffic.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(box.traffic))) return null;
  const q = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  return { ip: box.ip, port: Number(m[2]), path: (m[3] || "/") + q };
}

function proxy(req, res, host, port, path, extraHeaders = {}) {
  const headers = { ...req.headers, ...extraHeaders, host: `localhost:${port}` };
  delete headers["e2b-traffic-access-token"];
  const up = http.request({ host, port, path, method: req.method, headers }, (u) => {
    const h = { ...u.headers };
    if (h.location) h.location = String(h.location).replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, "");
    res.writeHead(u.statusCode || 502, h); u.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) send(res, 502, { error: "upstream not ready" }); else res.end(); });
  req.pipe(up);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    const t = previewTarget(url, req.headers);
    if (url.startsWith("/__preview/")) return t ? proxy(req, res, t.ip, t.port, t.path) : send(res, 403, { error: "forbidden" });
    if (url.startsWith("/ollama/")) {
      if (req.headers.authorization !== `Bearer ${ollamaKey}`) return send(res, 401, { error: "unauthorized" });
      return proxy(req, res, "127.0.0.1", 11434, url.slice("/ollama".length), { authorization: "" });
    }
    if (req.method !== "POST" || !url.startsWith("/v1/")) return send(res, 404, { error: "not found" });
    let body = ""; for await (const c of req) { body += c; if (body.length > 25 * 1024 * 1024) return send(res, 413, {}); }
    await api(req, res, url.split("?")[0], body);
  } catch (e) { send(res, e.status || 500, { error: String(e.message || e).slice(0, 300) }); }
});

// WebSockets (dev-server HMR) through the preview path.
server.on("upgrade", (req, socket, head) => {
  const t = previewTarget(req.url || "", req.headers);
  if (!t) return socket.destroy();
  const up = net.connect(t.port, t.ip, () => {
    const lines = [`${req.method} ${t.path} HTTP/1.1`, ...Object.entries({ ...req.headers, host: `localhost:${t.port}` }).filter(([k]) => k !== "e2b-traffic-access-token").map(([k, v]) => `${k}: ${v}`), "", ""];
    up.write(lines.join("\r\n")); up.write(head); socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy());
});

server.listen(PORT, "127.0.0.1", () => console.log(`[forge-runner] listening on 127.0.0.1:${PORT} key ${keyId}`));

// Reap expired workspaces and adopt nothing from a previous run (fresh state after restart).
await run("docker", ["network", "create", "forge-net"]);
const stale = (await run("docker", ["ps", "-aq", "--filter", "label=forge.box=1"])).stdout.split("\n").filter(Boolean);
if (stale.length) await run("docker", ["rm", "-f", ...stale]);
setInterval(() => { for (const [b, v] of boxes) if (v.expires < Date.now()) destroy(b); }, 30_000);

function currentEndpoint() {
  try { return fs.readFileSync(CFG.endpointFile || "/etc/forge-runner/endpoint", "utf8").trim(); } catch { return CFG.endpoint || ""; }
}

async function heartbeat() {
  const endpoint = currentEndpoint();
  if (!endpoint) return;
  const path = "/api/public/runner/heartbeat";
  const body = JSON.stringify({ key_id: keyId, endpoint, capacity: await capacity() });
  const ts = String(Date.now());
  try {
    await fetch(CFG.forgeUrl + path, { method: "POST", headers: { "content-type": "application/json", "x-forge-ts": ts, "x-forge-signature": hmac(`POST\n${path}\n${ts}\n${sha(body)}`) }, body, signal: AbortSignal.timeout(15_000) });
  } catch (e) { console.warn("[forge-runner] heartbeat failed", e.message); }
}
setInterval(heartbeat, 60_000); heartbeat();

if (process.argv.includes("--pairing-code")) {
  const code = Buffer.from(JSON.stringify({ url: currentEndpoint(), secret: CFG.secret })).toString("base64url");
  console.log(code); process.exit(0);
}
void spawn;
