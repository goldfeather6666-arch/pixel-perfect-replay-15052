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
