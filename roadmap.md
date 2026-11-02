# Roadmap — BYOK AI Coding Agent (Forge)
- [ ] Repair recurring stale approval/question requests at the shared RPC boundary and verify the reported task recovers without blanking chat.
- [x] Refresh dashboard, shared tokens/header and AI Elements chat presentation; signed-in desktop/phone verified, no horizontal overflow or browser errors, build OK.
- [x] Add contextual typing hints and explicit-request streamed BYOK refinement with optional acceptance, clarification questions, cancellation and stale-draft protection; 18 focused tests passed, new assistance files lint clean. Acceptance flow verified with simulated output; no coding run started.
- [ ] Real BYOK refinement completion — selected provider did not return within the browser check; cancelled, no automatic retry or model substitution. Live output remains unverified; full-project lint has existing errors outside the new assistance files.
- [ ] One-click Vercel sign-in — connected and identified (hasshan761-5718); the Vercel app itself still has no resource permissions, so it lists zero websites. Forge now says so in the Website step, probes teams, remembers the acting team and keeps it across token refreshes. Waiting on: permissions switched on in the Vercel app (Projects, Deployments, Environment Variables), then reconnect and relist.

- [x] Post-sync verification: checkout current through PR #26, build OK, 325/325 tests pass (gave the real-process production-script tests a 30s limit; they were timing out at 5s only under full-suite load), migration 0024 screenshot-access policies live, signed-in workspace and task pages render, published site renders with no backend-configuration error. No paid run, deployment or external change triggered.
- [x] Auto-release quiet runs: the every-five-minute job now stops any run silent past ten minutes and frees its sandbox, sparing approval/answer waits and anything recovery just restarted. 13 recovery tests pass; a manual run stopped three silent tasks, including one quiet 40 minutes. Automatic firing needs the published build.

- [x] Screenshot comparison in Preview: private reference/current uploads, authenticated AI Gateway comparison, prioritized layout findings, selected-fix brief for Chat. Real signed-in upload/comparison returned HTTP 200 and identified the intended header-height difference; targeted fixes are opt-in, no code changes or deployment triggered by verification.

- [x] Set inactivity detection to two minutes; manual Stop atomically fences the owner’s execution, marks it inactive and cancels browser waiting without heartbeat races. 26 focused tests pass; real signed-in Stop on the stuck Newproject task remained stopped after reload. No paid model run started; active model/shell cancellation remains covered by isolated tests.

- [x] Automatic liveness watchdog: two-minute silence detection, existing 5-min recovery schedule, three-retry cap, saved progress, atomic leases and execution fencing; Stop and approvals preserved. Real paid recovery not triggered.

- [x] Show Vercel account unlink in the website section and offer saved/new account connection choices; explicit unlink disables fallback and preserves saved accounts/remote websites. Nine account tests passed; real-account browser flow remains unverified.

- [x] Add read-only preview/database/Vercel diagnosis, AI service inspection tool, failed-network capture and opt-in auto-repair (three attempts, idle agents only, existing chat approvals). 24 preview tests passed; desktop/phone simulated failure verified service evidence in AI submission. No paid repair, SQL or deployment triggered; live service checks remain unverified.

- [x] Fix account-switch project lists and stale linked projects; expose clear Vercel link/unlink controls. Eight account tests passed and preview compiles. Real-account browser verification blocked: injected account has no suitable task/two Vercel accounts; isolated browser check inconclusive. No deployment triggered.

- [x] Surface file/MCP approvals and pending database migrations in live chat; shared resolvers and inline confirmations retain consent safeguards. 30 focused tests passed; signed-in simulated MCP approval verified desktop/phone and status read-back without external actions. Database application not executed during verification.

- [x] Reorganize built-in build/deployment guidance into a shared production-first contract for master, specialists, work splitting and repair briefs; preserve approvals and honest readiness claims. Focused checks passed; no paid model run triggered.
- [x] Add a crashed-preview repair popup that sends captured status, browser errors and fresh server logs to the agent with credential redaction. Signed-in desktop/phone simulated-crash check verified popup and exact diagnostic submission; no paid repair or production deployment started.

- [x] Replace runtime Ajv compilation with a non-eval cloud-compatible MCP validator; 23 focused tests passed, including blocked code generation. Live signed-in discovery validated all 8 Framer and 2 Motion tools; no external actions executed. Published code still requires publishing.

- [x] Recover stale page imports with bounded cache-busted document requests and a working manual retry; simulated failed sign-in import recovered in browser, four focused tests passed.

- [x] Guided new-project database/Vercel setup, encrypted optional server-only credentials, production/preview environment sync and blank GitHub configuration template (supervised staging preserved). Signed-in screens verified; external setting changes, repository writes and builds not triggered during checks.

- [x] Speed pass: master/helpers share bounded cached reads, repository scans coalesce, unchanged cloud branches skip fetches while tracked edits reset; 26 focused tests passed. No paid run started; whole-task speedup is unmeasured. Larger sandbox capacity remains a separate provider/template configuration, unchanged here.

- [x] Stop repeated generic verification notices: run omitted final checks automatically and retain sanitized timeout/environment failures; 21 focused tests passed. Saved Artelie3d activity confirms command timeouts and missing database settings; no paid task or external deployment started.

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
- [x] Surface real build errors: preflight failures now include the first sanitized error lines (credentials redacted) in the activity log and final notice instead of "read its output in Background activity"; 149 tests passed.

## Engine V2 (3 phases)
- [x] Phase A: run stages + transition history, sequenced replayable events, Run tab timeline with honest progress, error taxonomy + redacted error history, timings (first response, setup, per-tool, total), cost estimate. Verified in database: valid/invalid transitions, event order, cross-user block.
- [x] Phase B: model capability registry (context, vision, pricing), context trimmed to model window, vision guard, optional backup model; skill metadata/triggers/dependencies/version hash with per-run load records; MCP per-tool permissions (default/ask/deny) and execution audit.
- [x] Phase C: typed memory (project/preference/decision/error) with remember tool and Run-tab list; 13 specialist roles with dependency waves and structured reports; four autonomy levels enforced server-side.
- [ ] Live end-to-end run with a real key — needs your sign-in in the preview (several accounts exist, I can't pick one).
- [x] Resume checkpoints, MCP tool-list cache (6h, per URL), MCP resources/prompts (read-only), relevance-ranked memory + recall_memory

- [x] Multi-project parallel work: 3-4 tasks at once, each with its own repo/database/Vercel, no re-setup per project
- [ ] Live preview: Next.js runs + gateway verified; Artelie3d needs NEXT_PUBLIC_SUPABASE keys (database token lacks api_gateway_keys_read) — blocked on user; Vite app not yet live-tested
- [x] Several GitHub/database/Vercel accounts, chosen per project
- [x] Vite preview blocked host fixed
- [x] Phase A: Connect & sync (env, auth URLs, migrations, health) + Auto-fix
- [x] Phase B: task workspace (Chat/Preview/Deploy + More)
- [x] Phase C: home reorganise
- [x] Phase D: Settings sections
- [x] Knowledge panel: Rules/Memories/Tools tabs show nothing and don't update live

## Forge V3 master prompt
- [x] Discovery: task classes, question tool, durable Q&A (AWAITING_INPUT, idempotent answers, resume)
- [x] Suggestions with Accept / Keep mine / Discuss; versioned task specs
- [x] Reasoning profiles (auto/speed/balanced/deep) sent only where supported
- [x] Role model routing (coding/reviewer) + adaptive team sizing
- [ ] Measured speed benchmark vs baseline (blocked: needs your OK to spend AI credits on repeat runs)
- [x] Repository tree cache across runs, per-skill effectiveness scoring, structured worker report schema
