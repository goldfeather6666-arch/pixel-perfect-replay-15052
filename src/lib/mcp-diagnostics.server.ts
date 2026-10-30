import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { agentSkills } from "./agent-skills";
import { openSavedMcp } from "./mcp-oauth.server";
import { inspectMcp } from "./mcp-client.server";
import { connectionDiagnosticError, diagnoseTool } from "./mcp-diagnostics";

export async function accessDiagnostics(sb: SupabaseClient<Database>, userId: string) {
  const [skillsQuery, connectionsQuery] = await Promise.all([
    sb.from("skills").select("name, instructions, enabled").eq("user_id", userId),
    sb.from("mcp_connections").select("*").eq("user_id", userId).order("created_at"),
  ]);
  const enabledSkills = (skillsQuery.data ?? []).filter((s) => s.enabled);
  let skillError: string | null = skillsQuery.error ? "Saved skills could not be read for your signed-in account. Retry; if this persists, check account permissions." : null;
  if (!skillError) {
    try {
      const access = agentSkills(enabledSkills, null);
      const options = { toolCallId: "diagnostics", messages: [], context: {} };
      for (const skill of enabledSkills) {
        const read = await access.tools.read_skill.execute({ name: skill.name }, options);
        if (!("instructions" in read) || read.instructions !== skill.instructions) throw new Error("Skill mismatch");
      }
    } catch { skillError = "Saved skill instructions could not be accessed through the agent's read_skill tool."; }
  }
  const connections = await Promise.all((connectionsQuery.data ?? []).map(async (row) => {
    let client;
    try {
      client = await openSavedMcp(sb, row);
      const { definitions, sdkTools } = await inspectMcp(client, row.url, true);
      return { id: row.id, name: row.name, url: row.url, enabled: row.enabled, savedState: row.state,
        error: null as string | null, tools: definitions.map((d) => diagnoseTool(row.url, row.allow_actions, row.enabled && row.state === "ready", d, !!sdkTools[d.name])) };
    } catch (error) {
      return { id: row.id, name: row.name, url: row.url, enabled: row.enabled, savedState: row.state,
        error: connectionDiagnosticError(error), tools: [] };
    } finally { await client?.close().catch(() => {}); }
  }));
  return { checkedAt: new Date().toISOString(), skills: { error: skillError, items: (skillsQuery.data ?? []).map((s) => ({ name: s.name, enabled: s.enabled, chars: s.instructions.length, accessible: s.enabled && !skillError })) }, connections,
    connectionsError: connectionsQuery.error ? "Could not read your saved MCP connections. Retry while signed in." : null };
}