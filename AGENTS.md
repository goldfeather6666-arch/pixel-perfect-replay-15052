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
- User AI keys and GitHub tokens are stored only AES-GCM encrypted (src/lib/crypto.server.ts) and decrypted server-side; never return them to the browser. Why: BYOK security requirement.
- Model calls use the user's key via providers.server.ts, never the Lovable AI Gateway. Why: BYOK.
- The agent streams from the /api/agent server route as NDJSON events (AgentEvent in src/lib/providers.ts). Why: long tool loops need streaming outside server-fn request/response.
- Explicit Stop is owner-scoped, polled independently of model steps, and releases stalled SDK streams; save completion before remote cleanup and suppress auto-resume for stop-requested tasks. Stale stop updates compare the heartbeat before clearing a keeper. Why: cancellation must not hang on tools/cleanup or restart stopped work.
- Agent writes go only to its own per-task branch; supervised mode stages them in agent_sessions.pending until approved. Why: never touch the user's base branch without consent.
- GitHub file commits are serialized per repo+branch and retried on 409/sha conflicts (src/lib/branch-write-queue.ts). Why: parallel write_file calls race for the branch head.
- External MCP is a runtime client, not this app's MCP server: owner-scoped connections use encrypted optional bearer tokens and public HTTPS HTTP/SSE transports; read-only tools execute, all other tools stage immutable per-task requests when opted in, and clients close per turn. Why: preserve user isolation and explicit consent for external effects.
- MCP action approval accepts only a request ID and decision; verify owner/session first, atomically claim pending requests server-side, then validate the saved endpoint/schema/arguments and execute at most once. Why: prevent argument substitution, client-side approval bypass and replayed writes.
- Remote MCP OAuth uses the AI SDK provider, service-only AES-GCM credential storage and compare-and-set writes; callbacks require active owner auth, an HttpOnly browser-binding cookie, expiring single-use state and PKCE with authorization-server pins. Why: prevent token disclosure, callback replay and cross-user connection takeover.
- OAuth endpoint fetches validate public HTTPS DNS on every request and reject redirects; use HTTPS client metadata documents only when advertised, otherwise dynamic registration. Why: prevent private-network access and remain compatible with remote MCP authorization servers.
- Task sandboxes probe remote HEAD before fetching and reset tracked edits; tokens stay env-only. Master/helpers share run-scoped bounded reads; writes invalidate them and proposal merges read fresh. Why: less repeated work without stale checks or token files.
- Each user has one saved notes entry per repo (repo_memory), written only by the agent's save_memory tool and injected into the system prompt. Why: later tasks reuse the repo map instead of re-scanning.
- Guided startup uses owner-scoped encrypted account tokens and service-only encrypted task database settings. Sync values to Vercel production/preview/development, privileged keys server-only; GitHub receives only a blank variable-name template on the work branch, staged when supervised. Database changes remain ordered supabase/migrations/*.sql files tracked per task; deployments use explicit API builds. Why: secure, repeatable setup without credential commits or per-file builds.
- Agent teams: the master dispatches up to 12 jobs with four active workers, exact coder file assignments and ephemeral proposals; only the master merges non-stale proposals and verifies the integrated result. Shared sandbox commands and team dispatches serialize per session, workers cannot recursively delegate or trigger external effects, and worker model calls stagger then back off on provider throttling instead of retrying instantly. Why: parallel coding without overlapping writes, resource contention, shared-quota storms or bypassing approvals.
- Skills can be imported from any GitHub repository (src/lib/skill-import.server.ts): markdown is read through the GitHub API and stored as owner-scoped skills rows carrying a source pointer; imported text is only ever injected as instructions, never executed. Why: keep third-party repo content inert, attributable and reviewable.
- Saved enabled skills are caller-scoped and exposed through list_skills/read_skill to the primary and helper agents; load errors cannot masquerade as empty skills. Why: skills live in Forge, not repository files.
- MCP schemas select dialect validators and isolate unsupported tools. Why: remote schema compatibility.
- Chunk failures use bounded cache-busted document reloads, not router invalidation. Why: replace stale manifests.
- Access diagnostics use caller-scoped saved skills and live MCP discovery/schema validation, never invoke external tools or expose remote error bodies; distinguish discovery from execution. Why: truthful access checks without external effects or credential leaks.
- Edits invalidate deployment checks; run omitted final preflight once and keep sanitized failure categories. Vercel READY requires current commit/rebuild ID plus a bounded deployment-host entry-page probe. Why: generic retry loops hide blockers and passing builds can serve crashed pages.
- Vercel builds for agent/* branches: a vercel.json `git.deploymentEnabled` rule stops pushes from creating deployments (skipped builds still count toward Vercel's daily quota), and deploy_status/rebuild create one API deployment of a marked commit via startForgeDeploy; the ignore-command gate stays as a fallback and is never written over a user's own. A quota refusal is reported as LIMITED and ends the repair loop. Why: per-file commits exhausted Vercel's daily deployment limit.
- Public runs use /api/agent-background with a repo-free E2B keeper and refreshed token (env only); local/gated hosts stream in-browser. Claims are atomic; completion kills the keeper. taskRunStatus requires a fresh heartbeat plus keeper for cloud labels; lists poll when idle. Why: survive phone sleep, isolate tokens and show truthful cross-device status.
