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
- Chat reuses file/MCP approval resolvers and shows pending migrations with explicit confirmation; live polling continues after runs finish. Why: actionable consent without weakening safeguards.
- Build/deployment instructions share productionInstructions in deployment-quality.ts across master, specialists, work splitting and repair prompts; production-first never grants release consent. Why: consistent production expectations without bypassing approvals.
- Preview repairs use redacted logs and read-only pinned-service diagnosis via chat; opt-in auto-repair is capped and waits for idle agents. Why: safe evidence, bounded cost, existing approvals.
- Subdirectories may have their own AGENTS.md (src/lib/engine/); read it before changing files there.
- User AI keys/GitHub tokens are AES-GCM encrypted (crypto.server.ts), decrypted server-side only, never returned to the browser. Why: BYOK.
- Coding agents use user keys via providers.server.ts; screenshot comparison alone uses AI Gateway with authenticated task-owned private uploads and explicit selected-fix submission to Chat. Why: BYOK preserved with the requested visual-analysis exception.
- The agent streams NDJSON AgentEvents from /api/agent. Why: long tool loops need streaming.
- Stop uses session-stop.server.ts to atomically fence the owner’s execution and mark it inactive without heartbeat comparisons; independent polling cancels model/shell work, keeper cleanup is detached and fenced; stopped tasks never auto-resume. Why: heartbeat races and remote cleanup must not hold Stop hostage.
- Agent writes go only to its per-task branch; approval-required writes stage in agent_sessions.pending. Why: never touch the base branch without consent.
- Multi-file agent edits use write_files (one tree commit). Why: per-file commits dominated save time.
- GitHub commits serialize per repo+branch with 409/sha retries (branch-write-queue.ts). Why: parallel writes race.
- External MCP is a runtime client: owner-scoped, encrypted optional tokens, public HTTPS HTTP/SSE; read-only tools execute, others stage immutable per-task requests when opted in; clients close per turn. Why: isolation and consent.
- MCP approval takes only request ID + decision; verify owner, atomically claim, revalidate endpoint/schema/args, execute at most once. Why: no substitution or replay.
- MCP OAuth: AI SDK provider, service-only encrypted credentials, compare-and-set writes, owner-auth callbacks with HttpOnly binding cookie, single-use state, PKCE, server pins; fetches validate public HTTPS DNS each request and reject redirects. Why: no token leaks, replay or private-network access.
- Sandboxes probe remote HEAD before fetching, reset tracked edits, keep tokens env-only; run-scoped shared reads are invalidated by writes. Why: speed without stale checks.
- repo_memory (one note per user+repo via save_memory) plus typed project_memories are injected into prompts. Why: avoid rescans.
- deployment-env.ts owns framework-aware public/server env contracts, legacy aliases and known project-ref aliases. Service keys stay server-only; missing-env repairs verify pinned links, run Connect & sync/Auto-fix, then rebuild/runtime-probe before asking for values. Why: secure, framework-correct configuration.
- Guided setup: encrypted owner tokens and service-only task DB settings; sync to Vercel envs (privileged keys server-only); GitHub gets only a blank env template; migrations are ordered supabase/migrations/*.sql tracked per task. Why: no credential commits.
- Teams: master dispatches specialist jobs sized by engine/reasoning.ts teamPolicy (max 12 jobs, four active) in dependency waves; writer roles propose only exclusive assigned paths; only the master merges non-stale proposals; shared sandbox/dispatch serialize per session; workers cannot delegate or cause external effects; throttling backs off. Why: parallelism without conflicts or quota storms.
- Skills (saved or GitHub-imported with source pointer) are inert instruction text, caller-scoped; load errors never look like empty skills. Why: untrusted content stays data.
- MCP schemas use a non-eval interpreter; unsupported tools are isolated. Why: cloud forbids codegen.
- Chunk failures do bounded cache-busted reloads. Why: stale manifests.
- Diagnostics never invoke external tools or expose remote error bodies. Why: truthful checks without side effects.
- Edits invalidate deploy checks; omitted final preflight runs once; Vercel READY needs current commit plus entry-page probe; agent/* branches disable git deploys and use one API deploy; quota refusal = LIMITED. Why: hidden blockers, crashed pages, daily quota.
- Cloud runs use E2B keepers and a scheduled recovery job; progress and missing-heartbeat watchdogs share one inactivity limit, atomic consent-row leases cap recovery at 3, execution_id fences heartbeats/saves, and Stop/approvals survive recovery. Fresh one-off owner sessions stay server-only. Why: recover dead runs without duplicate execution or false liveness.
- Work splitting uses the caller's key, one master, exclusive coder paths. Why: BYOK.
- Live previews: preview-manager.server.ts runs one dev server per task in its E2B sandbox (private traffic); browsers reach it only via /api/preview/$ with short-lived HMAC tokens (revoked by token_version) and a path-scoped HttpOnly cookie; upstream secrets live encrypted in service-only preview_secrets; dev servers get task database env (server-only key only if saved in guided setup) from a 600-mode file outside the repo; 'ready' = process alive + HTTP < 500. Why: secure, honest previews that never imply deploy.
- Tasks pin GitHub/database/Vercel account ids (agent_sessions.accounts via accounts.ts; missing = newest, null = none) and inherit the repo's latest links; switches clear links atomically while idle; saved tokens are labeled/deduped by real provider account (account-identity.ts). Why: parallel multi-account projects that switch truthfully.
- Connect & sync (connect.server.ts, pure rules in connect.ts) is the single place that wires GitHub/database/Vercel: env sync, sign-in allow-list merge (never removes links), migrations, build/live probe; Auto-fix = sync then send only real blockers to the agent. Why: one truthful repair path.
- Task UI: Chat + Preview + Deploy are primary; Changes/Files/Terminal/Run/Agents/Knowledge live under More. Why: simple by default.


## Customer-owned infrastructure
- Resolve provider resources only from owner-scoped task-pinned accounts; missing/null links block setup, never select another customer or operator account. Inspect resource identity before remote changes; reuse selected projects and ask before creating/changing resources. Why: ownership and consent.
- Verify selected Vercel repo/root/framework/commands/runtime/envs for development, preview and production; diagnose from redacted logs and probes, fix bounded root causes, rerun preflight and the failing route. Never delete evidence merely for containing error text. Why: honest repair.
- Preview is separate from deployment: inspect the requested route, console and network, not only process/HTTP liveness. Deployment needs the exact project/commit READY plus runtime probe. Preserve data, RLS, auth and remote configuration; no resets, security disabling, credential rotation or external deployment without approval. Why: verified delivery without destructive shortcuts.
