import { compileMcpSchema } from "./mcp-schema";
import { allowedMcpTool } from "./mcp-policy";

export function diagnoseTool(url: string, allowActions: boolean, enabled: boolean, definition: { name: string; inputSchema: Record<string, unknown>; annotations?: { readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined } | undefined }, executable: boolean) {
  let schemaError: string | null = null;
  try { compileMcpSchema(definition.inputSchema); }
  catch { schemaError = "Input schema cannot be compiled by Forge. The server must supply a supported, self-contained JSON Schema."; }
  const readOnly = allowedMcpTool(url, definition);
  const error = schemaError ?? (!executable ? "The SDK did not expose this tool for execution." : null);
  return {
    name: definition.name, schemaValid: !schemaError, error,
    status: error ? "unsupported" : !enabled ? "paused" : !readOnly && !allowActions ? "blocked" : readOnly ? "available" : "approval_required",
    detail: error ?? (!enabled ? "Connection is paused." : !readOnly && !allowActions ? "Enable external action requests to use this tool." : readOnly ? "Discovered and validated; invocation not tested." : "Discovered and validated; execution requires approval in a task."),
  };
}

// Never return remote response bodies, URLs, headers or credential-bearing errors.
export function connectionDiagnosticError(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  if (/401|403|unauthor|sign.in|credential/i.test(text)) return "Authorization failed or expired. Sign in again, or check the bearer token and service access.";
  if (/timeout|timed out|abort/i.test(text)) return "The server did not respond within the connection timeout. Retry or check service availability.";
  if (/redirect/i.test(text)) return "The server redirected the request. Forge requires the final public HTTPS endpoint without redirects.";
  if (/public|resolve|DNS/i.test(text)) return "The endpoint did not resolve to an allowed public HTTPS address.";
  if (/404|not found/i.test(text)) return "The MCP endpoint returned not found. Check the server URL.";
  if (/schema|validat|parse/i.test(text)) return "The server returned an invalid MCP response or tool schema.";
  return "MCP connection or discovery failed. Check the endpoint, service availability and authentication, then retry.";
}