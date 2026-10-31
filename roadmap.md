# Roadmap — BYOK AI Coding Agent (Forge)

- [x] Prevent Vercel READY from masking runtime crashes: live Artelie3d HTTP 500 reproduced; Deploy panel and agent now check entry-page health; 16 focused tests passed.
- [ ] Repair Artelie3d's server-page crash — blocked: external project runtime logs / required environment presence must confirm the cause; public catalog currently requires an admin key. No external code edits, paid task or deployment triggered.

- [x] Repair Stop on stalled streams/cleanup, cancel actual shell work, retain stale-task Stop and suppress stopped-task auto-resume; focused tests passed. Current Artelie3d Deploy tab reads READY; task finished before a live Stop could be exercised.

- [x] Master-controlled team: up to 12 specialist jobs, four active workers, parallel code proposals, stale-file rejection and serialized shared commands; 21 focused tests passed. Real provider speed/cost remains unmeasured (no paid task triggered).

- [x] Phases 1–6: keys, GitHub, streaming agent, approvals, checkpoints, editor, PRs, skills, MCP (HTTP/SSE/OAuth/action approvals), E2B terminal
- [ ] OAuth acceptance — blocked: needs user's Notion consent + published check
- [ ] Local stdio MCP — skipped by user (mobile only)

## Claude-Code-quality round
- [x] 1. Plan mode (toggle, /plan, approve-plan button; write tools removed while planning)
- [x] 2. Test-and-fix loop (/test, system loop guidance, 50 steps)
- [x] 3. Smarter content search (regex, 400 files, skips vendored/build dirs)
- [x] 4. Long-conversation summarising
- [x] 5. Helper sub-agents
- [x] 6. Live app preview from sandbox
- [x] 7. Per-file accept/reject
- [x] 8. Token usage per task
- [x] 9. Slash commands + finish notification + image attachments
- [x] 10. Runs continue after tab close; progress saved each step; Stop works from any device
- [x] 11. Automatic model retries (3)
- [x] 12. Deep security scan reviewed; custom endpoints now public-HTTPS only
- [x] 13. Per-repo agent memory (save_memory tool, shown under Changes)
- [x] Supabase + Vercel sync per task (Deploy tab, apply_migrations, deploy_status auto-fix)
- [x] Import skills from any GitHub repo (Settings → Skills: paste a repo/folder link, pick SKILL.md or markdown files)
- [x] Official Framer MCP preset (HTTP + service sign-in, external actions remain opt-in)
- [x] Framer account connection — saved authorization confirmed; authenticated tool definitions retrieved (project editing not exercised)
- [x] Repair runtime Framer schema compatibility and explicit saved-skill access; caller-owned reads verified
- [x] Add Motion MCP presets and owner-scoped saved-skill / per-tool diagnostics; free docs connected, 18 skills and 8 Framer definitions verified without external actions
- [x] Deployment reliability: built-in coding skill, repeatable production checks, commit-matched Vercel results and bounded repair follow-ups (14 focused tests passed)
- [ ] Real failing-project deployment verification — requires an authorized task run; do not trigger paid agent runs or external deployments during tests
- [x] Cloud-kept runs: tasks continue when the phone sleeps/switches apps (keeper round trip verified; a full paid run not exercised)
- [x] Concurrent cloud tasks: several tasks each keep their own run (per-task keeper + claim, no shared lock); E2B probe held 6 sandboxes at once; task list shows "Running in the cloud" and refreshes itself (badge verified with temporary data)
- [x] Team runs survive provider throttling: workers stagger starts, wait with backoff on rate limits (429 / output-token caps) and say so plainly instead of dying with "check the connection"; a whole team sent as text still parses (focused tests passed)
- [x] Stop button beside background status; independent stop polling during model waiting
- [x] Visible task status above the new-task form on mobile and beside the open-task composer; distinguish cloud, browser, idle and stale runs using saved execution state.
- [x] Prompt composer: live character count, remaining-capacity warning, 300,000-character limit (boundary tests and phone-sized composer verified)
