import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMcpActions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sessionId: z.string().uuid() })).handler(async ({ data, context }) => {
    const { data: items, error } = await context.supabase.from("mcp_action_requests")
      .select("id, server_name, server_url, tool_name, arguments, state, result, created_at, expires_at")
      .eq("user_id", context.userId).eq("session_id", data.sessionId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error("Could not load external actions");
    return { items: items ?? [] };
  });

export const resolveMcpActionRequest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), approve: z.boolean() })).handler(async ({ data, context }) => {
    const { resolveMcpAction } = await import("./mcp-approval.server");
    return resolveMcpAction(context.supabase, context.userId, data.id, data.approve);
  });