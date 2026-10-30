# Remote MCP client implementation

- Existing auth: app accounts; `src/start.ts` attaches bearer tokens to protected server functions. `/api/agent` independently verifies its bearer token.
- Add `mcp_connections` owner-scoped storage with encrypted optional bearer tokens.
- Add URL/security helpers, a short-lived AI SDK MCP client helper, and protected connection management functions.
- Add a connections form to Settings; probe before saving and support enable, retry and removal.
- Merge namespaced discovery/invocation meta-tools into `/api/agent`, allow only read-only remote actions, close clients on completion and errors.
- Test URL restrictions, tool isolation and cleanup; verify Settings in a signed-in browser.
- Continue with SSE transport in mcp-client.server.ts, mcp.functions.ts and McpConnections.tsx; persist transport on owner-scoped connections.
- Add owner-scoped external action requests, protected approve/reject functions and an approval list in Settings; expose writes only as staged requests to the model.
- Authenticated server functions use src/start.ts bearer middleware; /api/agent separately verifies bearer tokens.
- OAuth: add service-only encrypted mcp_oauth_credentials; mcp-oauth.server.ts implements the installed SDK provider with PKCE/state and authorization-server binding, public-URL checked fetch and refresh persistence.
- Add protected begin/complete sign-in functions, a /mcp/callback page resuming through the active app session, and Settings sign-in/reconnect controls. Runtime reads and action approvals use the saved provider. Local stdio and sandbox execution remain blocked on external execution services.