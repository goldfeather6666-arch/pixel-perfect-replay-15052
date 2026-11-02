# Use your free Oracle server inside Forge

## What you get
- **Agent workspaces on your server.** Coding, terminal and test runs use your Oracle server first, not paid E2B.
- **Live previews like Lovable.** Each task's website runs on your server and appears in the Preview tab. It refreshes as agents edit and stays behind the existing signed, private preview link.
- **Always-on keeper.** Your server keeps background runs going and restarts stalled ones.
- **Free local AI model.** A small open model (for example Qwen2.5-Coder 7B through Ollama) appears as a free choice in the model picker. It runs on the server's processor, so it's slower. It works best for helper and review jobs.
- **Automatic fallback.** If your server is down or full, Forge switches back to E2B and labels the run.

## Your one-time setup (guided in Settings)
1. Create an Ampere A1 VM (4 cores, 24 GB) with Ubuntu.
2. Paste one install command. It installs Docker, the Forge runner, Ollama and a secure tunnel, so no ports need to be opened.
3. Paste the pairing code shown by the server into Forge. Settings then shows the status as Online.

## Technical details
- New `forge-runner` (a small Node service in `runner/`) with HTTPS endpoints: create/exec/stream/files/destroy workspace (one Docker container per task, with limits on processor, memory and disk), start the preview dev server, and keeper heartbeat. Callers authenticate with an HMAC-signed request using a per-owner pairing secret.
- Exposed through a Cloudflare Tunnel (free). Forge only accepts public HTTPS addresses, following the existing SSRF rules.
- New table `owner_runners` (owner_id, endpoint, encrypted secret, status, capacity, last_seen) with owner-only RLS. The secret stays server-only.
- A `SandboxProvider` interface added in `sandbox.server.ts`, `preview-manager.server.ts` and `background-run.server.ts`, with `oracle` and `e2b` implementations. Selection order: a healthy owner runner first, then E2B. Existing fencing, Stop and the inactivity watchdog apply to both.
- Preview gateway `/api/preview/$` proxies to the runner's preview port. Tokens, cookies and `token_version` work the same as today.
- Ollama is registered as an OpenAI-compatible custom endpoint connection and goes through existing BYOK routing, so the master can assign it to the coding or review role.
- Settings has a "Your server" card with the install script, pairing, health, capacity and a fallback indicator.
- Tests cover provider selection and fallback, HMAC verification, the pairing flow, and Stop on the runner provider.

## What I can't do
- I can't create the Oracle VM for you or log into it. You run the install command once.
- Oracle can reclaim idle free VMs. The keeper's heartbeat traffic helps keep yours active.
