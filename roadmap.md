# Roadmap — BYOK AI Coding Agent (Forge)

- [x] Phase 1: Sign-in, encrypted BYOK provider keys, model discovery + manual model ID
- [x] Phase 2: GitHub token — repo/branch picker, file tree, file viewer
- [x] Phase 3: Streaming agent chat with real GitHub tools on a per-task branch, saved task history
- [x] Phase 4: Supervised approvals with diffs, autonomous commits, checkpoints/restore/undo, in-browser editor, pull requests
- [x] Phase 6 (part): Skills, AGENTS.md/CLAUDE.md project instructions, README self-hosting docs, MIT license
- [x] Phase 6: HTTPS/public or encrypted bearer-token MCP connections; read-only discovery/invocation, enable/pause, recheck and disconnect
- [x] MCP follow-up: SSE transport and opt-in per-action approval for external writes; immutable arguments, expiry, atomic execution claim and saved results
- [ ] MCP follow-up: OAuth sign-in — in progress: encrypted credentials, verified callback, refresh and reconnect
- [ ] MCP follow-up: local stdio — blocked: requires a local execution bridge outside the hosted app
- [ ] Phase 5: Sandbox terminal + running tests — blocked: needs a sandbox service account key (e.g. E2B or Daytona)
