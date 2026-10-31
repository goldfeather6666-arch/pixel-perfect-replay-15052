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
- Model calls use the user's own provider key via src/lib/providers.server.ts, never the Lovable AI Gateway. Why: the product is BYOK.
- The agent streams from the /api/agent server route as NDJSON events (AgentEvent in src/lib/providers.ts). Why: long tool loops need streaming outside server-fn request/response.
- Explicit Stop is owner-scoped and polled independently of model steps; keep the stream open to save partial progress. Why: background runs must cancel during model waiting without treating ordinary tab closure as Stop.
- Agent writes go only to its own per-task branch; supervised mode stages them in agent_sessions.pending until approved. Why: never touch the user's base branch without consent.
- GitHub file commits are serialized per repo+branch and retried on 409/sha conflicts (src/lib/branch-write-queue.ts). Why: parallel write_file calls race for the branch head.
- External MCP is a runtime client, not this app's MCP server: owner-scoped connections use encrypted optional bearer tokens and public HTTPS HTTP/SSE transports; read-only tools execute, all other tools stage immutable per-task requests when opted in, and clients close per turn. Why: preserve user isolation and explicit consent for external effects.
- MCP action approval accepts only a request ID and decision; verify owner/session first, atomically claim pending requests server-side, then validate the saved endpoint/schema/arguments and execute at most once. Why: prevent argument substitution, client-side approval bypass and replayed writes.
- Remote MCP OAuth uses the AI SDK provider, service-only AES-GCM credential storage and compare-and-set writes; callbacks require active owner auth, an HttpOnly browser-binding cookie, expiring single-use state and PKCE with authorization-server pins. Why: prevent token disclosure, callback replay and cross-user connection takeover.
- OAuth endpoint fetches validate public HTTPS DNS on every request and reject redirects; use HTTPS client metadata documents only when advertised, otherwise dynamic registration. Why: prevent private-network access and remain compatible with remote MCP authorization servers.
- Commands run in a per-task E2B sandbox (src/lib/sandbox.server.ts) reused via agent_sessions.sandbox_id; the GitHub token is passed per command as env only and sandbox edits are never saved. Why: keep code execution isolated and the token off disk.
- Each user has one saved notes entry per repo (repo_memory), written only by the agent's save_memory tool and injected into the system prompt. Why: later tasks reuse the repo map instead of re-scanning.
- Supabase/Vercel integrations use the user's own encrypted tokens (src/lib/integrations.server.ts, fixed API hosts); each task links one Supabase project and one Vercel project, database changes are only supabase/migrations/*.sql files applied once in order and tracked per task, and Vercel previews come from its GitHub auto-deploy of the work branch. Why: repo stays the source of truth and database changes are reviewable and replay-safe.
- Agent teams: the master dispatches up to 12 jobs with four active workers, exact coder file assignments and ephemeral proposals; only the master merges non-stale proposals and verifies the integrated result. Shared sandbox commands and team dispatches serialize per session, and workers cannot recursively delegate or trigger external effects. Why: parallel coding without overlapping writes, resource contention or bypassing approvals.
- Skills can be imported from any GitHub repository (src/lib/skill-import.server.ts): markdown is read through the GitHub API and stored as owner-scoped skills rows carrying a source pointer; imported text is only ever injected as instructions, never executed. Why: keep third-party repo content inert, attributable and reviewable.
- Saved enabled skills are caller-scoped and exposed through list_skills/read_skill to the primary and helper agents; load errors cannot masquerade as empty skills. Why: skills live in Forge, not repository files.
- External MCP schemas select the appropriate JSON Schema validator and isolate unsupported tools instead of dropping the entire server. Why: remote providers use different schema dialects.
- Access diagnostics use caller-scoped saved skills and live MCP discovery/schema validation, never invoke external tools or expose remote error bodies; distinguish discovery from execution. Why: truthful access checks without external effects or credential leaks.
- The coding agent always receives the built-in deployment-safe-coding skill and deployment_preflight tool; edits invalidate verification, bounded follow-ups repair missing checks, and Vercel results must match the current full commit SHA (and requested rebuild ID). Why: dev-server success and stale deployments cannot establish production readiness.
- Vercel builds for agent/* branches: a vercel.json `git.deploymentEnabled` rule stops pushes from creating deployments (skipped builds still count toward Vercel's daily quota), and deploy_status/rebuild create one API deployment of a marked commit via startForgeDeploy; the ignore-command gate stays as a fallback and is never written over a user's own. A quota refusal is reported as LIMITED and ends the repair loop. Why: per-file commits exhausted Vercel's daily deployment limit.
- Agent runs on public hosts start through /api/agent-background: a dedicated repo-free E2B keeper sandbox holds the /api/agent stream with the user's freshly refreshed token (env only) and is killed when the run ends; local or gated-preview hosts fall back to browser streaming, and /api/agent claims each run atomically. Why: hosting cancels requests when the phone sleeps or switches apps, and repo code must never see the session token.
