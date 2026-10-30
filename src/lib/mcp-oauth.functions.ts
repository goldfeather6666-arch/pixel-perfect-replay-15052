import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest, getRequestHeader, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { connectionInput } from "./mcp-policy";

export const beginMcpOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(connectionInput.extend({ id: z.string().uuid().optional() })).handler(async ({ data, context }) => {
    const { openMcp, inspectMcp } = await import("./mcp-client.server");
    const { oauthProvider, stateDigest } = await import("./mcp-oauth.server");
    const origin = getRequestHeader("origin") ?? new URL(getRequest().url).origin;
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin !== origin || (parsedOrigin.protocol !== "https:" && origin !== "http://localhost:8080")) throw new Error("Sign-in requires a secure app address");
    let row;
    if (data.id) {
      const { data: owned } = await context.supabase.from("mcp_connections").select("*").eq("id", data.id).eq("user_id", context.userId).eq("auth_mode", "oauth").single();
      if (!owned) throw new Error("Connection not found");
      row = owned;
    } else {
      const { data: created, error } = await context.supabase.from("mcp_connections").insert({ user_id: context.userId, name: data.name, url: data.url, transport_mode: data.transport, allow_actions: data.allowActions, auth_mode: "oauth", state: "failed", oauth_status: "authenticating" }).select("*").single();
      if (error || !created) throw new Error("Could not save connection");
      row = created;
    }
    await context.supabase.from("mcp_connections").update({ state: "failed", oauth_status: "authenticating" }).eq("id", row.id).eq("user_id", context.userId);
    const state = `${row.id}.${crypto.randomUUID()}`;
    setCookie(`forge-mcp-${row.id}`, await stateDigest(state), { httpOnly: true, secure: parsedOrigin.protocol === "https:", sameSite: "lax", path: "/", maxAge: 600 });
    const saved = await oauthProvider(row, { origin, state });
    let client;
    try {
      client = await openMcp(row.url, undefined, row.transport_mode === "sse" ? "sse" : "http", saved.provider, saved.fetch);
      const { definitions } = await inspectMcp(client, row.url, row.allow_actions);
      if (!definitions.length) throw new Error("No eligible tools");
      await context.supabase.from("mcp_connections").update({ state: "ready", oauth_status: "ready", tool_names: definitions.map((t) => t.name) }).eq("id", row.id).eq("user_id", context.userId);
      // Public endpoints do not trigger OAuth; keep a durable empty provider for later challenges.
      await saved.persist();
      return { ok: true, authUrl: "", message: "Connection verified and saved" };
    } catch {
      const authUrl = saved.getAuthUrl();
      if (authUrl) return { ok: true, authUrl, message: "Continue sign-in with the external service" };
      await context.supabase.from("mcp_connections").update({ oauth_status: "failed" }).eq("id", row.id).eq("user_id", context.userId);
      return { ok: false, authUrl: "", message: "Sign-in could not start. The server must support OAuth client registration." };
    } finally { await client?.close().catch(() => {}); }
  });

export const completeMcpOAuth = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().max(4000).default(""), state: z.string().regex(/^[0-9a-f-]{36}\.[0-9a-f-]{36}$/), issuer: z.string().max(2048).optional(), denied: z.boolean().default(false) }))
  .handler(async ({ data, context }) => {
    const { stateDigest, finishOAuth } = await import("./mcp-oauth.server");
    const { inspectMcp, openMcp } = await import("./mcp-client.server");
    const id = data.state.split(".")[0];
    if (!id) throw new Error("Missing connection");
    const { data: row } = await context.supabase.from("mcp_connections").select("*").eq("id", id).eq("user_id", context.userId).eq("auth_mode", "oauth").single();
    const digest = await stateDigest(data.state);
    if (!row || getCookie(`forge-mcp-${id}`) !== digest) return { ok: false, message: "Sign-in expired or belongs to another browser. Start again from Settings." };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: claimed, error } = await admin.from("mcp_oauth_credentials").update({ flow_claimed: true })
      .eq("connection_id", id).eq("user_id", context.userId).eq("flow_digest", digest).eq("flow_claimed", false)
      .gt("flow_expires_at", new Date().toISOString()).select("connection_id").maybeSingle();
    if (error || !claimed) return { ok: false, message: "Sign-in expired or was already completed. Start again from Settings." };
    deleteCookie(`forge-mcp-${id}`, { path: "/" });
    let client;
    try {
      if (data.denied || !data.code) throw new Error("Sign-in cancelled");
      const saved = await finishOAuth(row, data.code, data.state, data.issuer);
      client = await openMcp(row.url, undefined, row.transport_mode === "sse" ? "sse" : "http", saved.provider, saved.fetch);
      const { definitions } = await inspectMcp(client, row.url, row.allow_actions);
      if (!definitions.length) throw new Error("No eligible tools");
      const { error: saveError } = await context.supabase.from("mcp_connections").update({ state: "ready", oauth_status: "ready", tool_names: definitions.map((t) => t.name), updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", context.userId);
      if (saveError) throw saveError;
      return { ok: true, message: "External service connected" };
    } catch {
      await context.supabase.from("mcp_connections").update({ state: "failed", oauth_status: "failed" }).eq("id", id).eq("user_id", context.userId);
      return { ok: false, message: data.denied ? "Sign-in cancelled. No access was granted." : "Could not finish sign-in. Retry from Settings." };
    } finally { await client?.close().catch(() => {}); }
  });