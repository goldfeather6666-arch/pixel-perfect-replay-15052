<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Chat and Changes reuse the same file/MCP approval controls and existing server resolvers; live polling surfaces requests even after runs finish. Why: consent is actionable without navigating away or weakening safeguards.
- Build/deployment instructions share productionInstructions in deployment-quality.ts across master, specialists, work splitting and repair prompts; production-first never grants release consent. Why: consistent production expectations without bypassing approvals.
- Preview crash repair uses captured status/browser errors and fresh server logs, redacted by preview-repair.ts, through the existing task send flow; repair is user-triggered and disabled during active runs. Why: actionable evidence without secret leakage or competing runs.
- Subdirectories may have their own AGENTS.md (src/lib/engine/); read it before changing files there.
- User AI keys/GitHub tokens are AES-GCM encrypted (crypto.server.ts), decrypted server-side only, never returned to the browser. Why: BYOK.
- Model calls use the user's key via providers.server.ts, never the Lovable AI Gateway. Why: BYOK.
- The agent streams NDJSON AgentEvents from /api/agent. Why: long tool loops need streaming.
- Stop is owner-scoped, polled independently of model steps, releases stalled streams; completion saves before remote cleanup; stopped tasks never auto-resume; stale stop compares heartbeat before clearing a keeper. Why: cancellation must not hang or restart work.
- Agent writes go only to its per-task branch; approval-required writes stage in agent_sessions.pending. Why: never touch the base branch without consent.
- Multi-file agent edits use write_files (one tree commit). Why: per-file commits dominated save time.
- GitHub commits serialize per repo+branch with 409/sha retries (branch-write-queue.ts). Why: parallel writes race.
- External MCP is a runtime client: owner-scoped, encrypted optional tokens, public HTTPS HTTP/SSE; read-only tools execute, others stage immutable per-task requests when opted in; clients close per turn. Why: isolation and consent.
- MCP approval takes only request ID + decision; verify owner, atomically claim, revalidate endpoint/schema/args, execute at most once. Why: no substitution or replay.
- MCP OAuth: AI SDK provider, service-only encrypted credentials, compare-and-set writes, owner-auth callbacks with HttpOnly binding cookie, single-use state, PKCE, server pins; fetches validate public HTTPS DNS each request and reject redirects. Why: no token leaks, replay or private-network access.
- Sandboxes probe remote HEAD before fetching, reset tracked edits, keep tokens env-only; run-scoped shared reads are invalidated by writes. Why: speed without stale checks.
- repo_memory (one note per user+repo via save_memory) plus typed project_memories are injected into prompts. Why: avoid rescans.
- Guided setup: encrypted owner tokens and service-only task DB settings; sync to Vercel envs (privileged keys server-only); GitHub gets only a blank env template; migrations are ordered supabase/migrations/*.sql tracked per task. Why: no credential commits.
- Teams: master dispatches up to 12 specialist jobs (four active) in dependency waves; writer roles propose only exclusive assigned paths; only the master merges non-stale proposals; shared sandbox/dispatch serialize per session; workers cannot delegate or cause external effects; throttling backs off. Why: parallelism without conflicts or quota storms.
- Skills (saved or GitHub-imported with source pointer) are inert instruction text, caller-scoped; load errors never look like empty skills. Why: untrusted content stays data.
- MCP schemas use a non-eval interpreter; unsupported tools are isolated. Why: cloud forbids codegen.
- Chunk failures do bounded cache-busted reloads. Why: stale manifests.
- Diagnostics never invoke external tools or expose remote error bodies. Why: truthful checks without side effects.
- Edits invalidate deploy checks; omitted final preflight runs once; Vercel READY needs current commit plus entry-page probe; agent/* branches disable git deploys and use one API deploy; quota refusal = LIMITED. Why: hidden blockers, crashed pages, daily quota.
- Public runs use /api/agent-background with an E2B keeper (token env-only); claims atomic; completion kills keeper; a 5-min scheduled job (/api/public/jobs/resume-runs) restarts dead, unstopped cloud runs up to 3 times via a fresh one-off owner session (consent row in service-only run_resume_secrets, never the browser's token); cloud labels need fresh heartbeat + keeper. Why: survive phone sleep truthfully.
- Work splitting uses the caller's key, one master, exclusive coder paths. Why: BYOK.
- Live previews: preview-manager.server.ts runs one dev server per task preview in the task's E2B sandbox (private traffic); browsers reach it only via /api/preview/$ with short-lived HMAC tokens (preview-token.server.ts, revoked by token_version) and a path-scoped HttpOnly cookie; upstream host/traffic token live encrypted in service-only preview_secrets. Agents may call a preview working only after status 'ready' (process alive + HTTP < 500). Why: secure previews, honest readiness, preview never implies deploy.
- Each task stores its chosen GitHub/database/Vercel account ids (agent_sessions.accounts, resolved by accounts.ts; missing = newest saved); new tasks inherit the repo's latest links, accounts and saved DB settings. Why: multiple accounts and parallel projects without re-setup.
- Connect & sync (connect.server.ts, pure rules in connect.ts) is the single place that wires GitHub/database/Vercel: env sync, sign-in allow-list merge (never removes links), migrations, build/live probe; Auto-fix = sync then send only real blockers to the agent. Why: one truthful repair path.
- Task UI: Chat + Preview + Deploy are primary; Changes/Files/Terminal/Run/Agents/Knowledge live under More. Why: simple by default.
