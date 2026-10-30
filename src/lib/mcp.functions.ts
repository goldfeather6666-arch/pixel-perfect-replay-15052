import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { connectionInput } from "./mcp-policy";

export const listMcpConnections = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("mcp_connections").select("id, name, url, transport_mode, allow_actions, state, enabled, tool_names, created_at").eq("user_id", context.userId).order("created_at");
  if (error) throw new Error("Could not load connections. Please retry.");
  return { items: data ?? [] };
});

export const connectMcp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(connectionInput).handler(async ({ data, context }) => {
  const { openMcp, inspectMcp } = await import("./mcp-client.server");
  const { encryptSecret } = await import("./crypto.server");
  let client;
  try {
    client = await openMcp(data.url, data.token || undefined, data.transport);
    const { definitions } = await inspectMcp(client, data.url, data.allowActions);
    if (!definitions.length) return { ok: false, message: "No eligible tools found. Enable action requests to connect a server without read-only tools." };
    const encrypted = data.token ? await encryptSecret(data.token) : { ciphertext: null, iv: null };
    const { error } = await context.supabase.from("mcp_connections").insert({ user_id: context.userId, name: data.name, url: data.url, transport_mode: data.transport, allow_actions: data.allowActions, ...encrypted, tool_names: definitions.map((t) => t.name) });
    if (error) throw new Error("Save failed");
    return { ok: true, message: "Connection verified and saved" };
  } catch {
    return { ok: false, message: "Could not connect. Check the HTTPS endpoint and token. OAuth-only servers are not supported yet." };
  } finally { await client?.close().catch(() => {}); }
});

export const changeMcpConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), enabled: z.boolean().optional(), remove: z.boolean().default(false), retry: z.boolean().default(false) })).handler(async ({ data, context }) => {
  const table = context.supabase.from("mcp_connections");
  if (data.remove) {
    const { error } = await table.delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error("Could not remove connection");
  } else if (data.retry) {
    const { data: row, error } = await table.select("*").eq("id", data.id).eq("user_id", context.userId).single();
    if (error || !row) throw new Error("Connection not found");
    const { openMcp, inspectMcp } = await import("./mcp-client.server");
    const { decryptSecret } = await import("./crypto.server");
    let client;
    try {
      client = await openMcp(row.url, row.ciphertext && row.iv ? await decryptSecret(row.ciphertext, row.iv) : undefined, row.transport_mode === "sse" ? "sse" : "http");
      const { definitions } = await inspectMcp(client, row.url, row.allow_actions);
      if (!definitions.length) throw new Error("No eligible tools");
      const { error: saveError } = await table.update({ state: "ready", tool_names: definitions.map((t) => t.name), updated_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", context.userId);
      if (saveError) throw saveError;
    } catch {
      await table.update({ state: "failed" }).eq("id", data.id).eq("user_id", context.userId);
      return { ok: false, message: "Connection failed. Check the server or remove it and reconnect with a new token." };
    } finally { await client?.close().catch(() => {}); }
  } else if (data.enabled !== undefined) {
    const { error } = await table.update({ enabled: data.enabled }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error("Could not update connection");
  }
  return { ok: true, message: "Connection updated" };
});