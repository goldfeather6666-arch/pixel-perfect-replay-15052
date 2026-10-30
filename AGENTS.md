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
- Agent writes go only to its own per-task branch; supervised mode stages them in agent_sessions.pending until approved. Why: never touch the user's base branch without consent.
- External MCP is a runtime client, not this app's MCP server: owner-scoped connections use encrypted optional bearer tokens and public HTTPS HTTP/SSE transports; read-only tools execute, all other tools stage immutable per-task requests when opted in, and clients close per turn. Why: preserve user isolation and explicit consent for external effects.
- MCP action approval accepts only a request ID and decision; verify owner/session first, atomically claim pending requests server-side, then validate the saved endpoint/schema/arguments and execute at most once. Why: prevent argument substitution, client-side approval bypass and replayed writes.
- Remote MCP OAuth uses the AI SDK provider, service-only AES-GCM credential storage and compare-and-set writes; callbacks require active owner auth, an HttpOnly browser-binding cookie, expiring single-use state and PKCE with authorization-server pins. Why: prevent token disclosure, callback replay and cross-user connection takeover.
- OAuth endpoint fetches validate public HTTPS DNS on every request and reject redirects; use HTTPS client metadata documents only when advertised, otherwise dynamic registration. Why: prevent private-network access and remain compatible with remote MCP authorization servers.
