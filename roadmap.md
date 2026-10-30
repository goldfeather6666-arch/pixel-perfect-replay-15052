# Roadmap — BYOK AI Coding Agent (Forge)

- [x] Phase 1: Sign-in, encrypted BYOK provider keys, model discovery + manual model ID
- [x] Phase 2: GitHub token — repo/branch picker, file tree, file viewer
- [x] Phase 3: Streaming agent chat with real GitHub tools on a per-task branch, saved task history
- [x] Phase 4: Supervised approvals with diffs, autonomous commits, checkpoints/restore/undo, in-browser editor, pull requests
- [x] Phase 6 (part): Skills, AGENTS.md/CLAUDE.md project instructions, README self-hosting docs, MIT license
- [x] Phase 6: HTTPS/public or encrypted bearer-token MCP connections; read-only discovery/invocation, enable/pause, recheck and disconnect
- [x] MCP follow-up: SSE transport and opt-in per-action approval for external writes; immutable arguments, expiry, atomic execution claim and saved results
- [x] MCP follow-up: OAuth sign-in implementation — encrypted credentials, active-owner/browser-bound callback, PKCE/state, SDK refresh and reconnect; real Notion registration and cancellation verified
- [ ] OAuth acceptance: successful external account consent, post-consent reads/refresh and hosted HTTPS client metadata — blocked: needs external account consent and hosted verification
- [ ] MCP follow-up: local stdio — skipped for now by user (mobile only, no computer for a local helper)
- [ ] Phase 5: Sandbox terminal + running tests via E2B — blocked: waiting for E2B_API_KEY
