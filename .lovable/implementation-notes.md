# Remote MCP client implementation

- Existing auth: app accounts; `src/start.ts` attaches bearer tokens to protected server functions. `/api/agent` independently verifies its bearer token.
- Add `mcp_connections` owner-scoped storage with encrypted optional bearer tokens.
- Add URL/security helpers, a short-lived AI SDK MCP client helper, and protected connection management functions.
- Add a connections form to Settings; probe before saving and support enable, retry and removal.
- Merge namespaced discovery/invocation meta-tools into `/api/agent`, allow only read-only remote actions, close clients on completion and errors.
- Test URL restrictions, tool isolation and cleanup; verify Settings in a signed-in browser.
- OAuth-only endpoints and sandbox execution remain separately blocked/unfinished, not silently replaced with public access.