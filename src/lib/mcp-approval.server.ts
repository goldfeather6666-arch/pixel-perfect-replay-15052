import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import Ajv from "ajv";
import { canonicalJson } from "./mcp-policy";
import { decryptSecret } from "./crypto.server";
import { openMcp, inspectMcp } from "./mcp-client.server";

// The caller-facing client verifies ownership before the privileged, atomic claim.
export async function resolveMcpAction(sb: SupabaseClient<Database>, userId: string, id: string, approve: boolean) {
  const { data: row } = await sb.from("mcp_action_requests").select("*").eq("id", id).eq("user_id", userId).single();
  if (!row || row.state !== "pending") throw new Error("Action is unavailable or already resolved");
  const { data: session } = await sb.from("agent_sessions").select("id").eq("id", row.session_id).eq("user_id", userId).single();
  if (!session) throw new Error("Task not found");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: claimed, error } = await supabaseAdmin.from("mcp_action_requests")
    .update({ state: approve ? "executing" : "rejected" })
    .eq("id", id).eq("user_id", userId).eq("state", "pending")
    .select("id").maybeSingle();
  if (error || !claimed) throw new Error("Action is already being resolved");
  if (!approve) return { ok: true, message: "External action rejected" };

  let client;
  try {
    if (Date.parse(row.expires_at) <= Date.now()) throw new Error("Approval expired");
    const { data: connection } = await sb.from("mcp_connections").select("*")
      .eq("id", row.connection_id).eq("user_id", userId).eq("enabled", true).eq("state", "ready").eq("allow_actions", true).single();
    if (!connection || connection.url !== row.server_url || connection.transport_mode !== row.transport_mode) throw new Error("Connection changed or disabled");
    client = await openMcp(connection.url, connection.ciphertext && connection.iv ? await decryptSecret(connection.ciphertext, connection.iv) : undefined, connection.transport_mode === "sse" ? "sse" : "http");
    const { definitions, sdkTools } = await inspectMcp(client, connection.url, true);
    const definition = definitions.find((d) => d.name === row.tool_name);
    const sdkTool = sdkTools[row.tool_name];
    if (!definition || !sdkTool || canonicalJson(definition.inputSchema) !== canonicalJson(row.input_schema)) throw new Error("Tool changed since approval was requested");
    const validate = new Ajv({ strict: false }).compile(definition.inputSchema);
    if (!validate(row.arguments)) throw new Error("Invalid saved arguments");
    const output = await sdkTool.execute(row.arguments as Record<string, unknown>);
    const failed = !!(output && typeof output === "object" && "isError" in output && output.isError);
    const result = JSON.stringify(output ?? null).slice(0, 8000);
    const { error: saveError } = await supabaseAdmin.from("mcp_action_requests").update({ state: failed ? "failed" : "succeeded", result }).eq("id", id).eq("user_id", userId).eq("state", "executing");
    if (saveError) return { ok: false, message: "Action sent, but its result could not be saved. Check the external service; do not retry blindly." };
    return { ok: !failed, message: failed ? "External service reported a failed action" : "External action completed" };
  } catch {
    await supabaseAdmin.from("mcp_action_requests").update({ state: "failed", result: "Action could not be confirmed. Check the service before requesting another attempt." }).eq("id", id).eq("user_id", userId).eq("state", "executing");
    return { ok: false, message: "Action could not be confirmed. It will not be retried automatically." };
  } finally { await client?.close().catch(() => {}); }
}