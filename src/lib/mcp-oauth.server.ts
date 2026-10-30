import { auth, type OAuthClientProvider, type OAuthTokens, type OAuthClientInformation, type OAuthAuthorizationServerInformation } from "@ai-sdk/mcp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { encryptSecret, decryptSecret } from "./crypto.server";
import { guardedMcpFetch, verifyPublicTarget } from "./mcp-network.server";
import { canonicalJson } from "./mcp-policy";
import { mcpClientMetadata } from "./mcp-client-metadata";

type Connection = Database["public"]["Tables"]["mcp_connections"]["Row"];
type Material = { origin: string; state?: string; verifier?: string; tokens?: OAuthTokens; client?: OAuthClientInformation; server?: OAuthAuthorizationServerInformation; dynamic?: boolean };

export async function stateDigest(state: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state))), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function oauthProvider(row: Connection, fresh?: { origin: string; state: string }) {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { data: stored, error } = await admin.from("mcp_oauth_credentials").select("*").eq("connection_id", row.id).eq("user_id", row.user_id).maybeSingle();
  if (error) throw new Error("Could not load sign-in credentials");
  const material: Material = fresh ?? (stored ? JSON.parse(await decryptSecret(stored.ciphertext, stored.iv)) : undefined);
  if (!material) throw new Error("Sign in to this connection first");
  let authUrl: string | undefined;
  let version = stored?.ciphertext;
  const persist = async () => {
    const encrypted = await encryptSecret(JSON.stringify(material));
    if (!version) {
      const { error: saveError } = await admin.from("mcp_oauth_credentials").insert({ connection_id: row.id, user_id: row.user_id, ...encrypted,
        flow_digest: material.state ? await stateDigest(material.state) : null, flow_expires_at: new Date(Date.now() + 600000).toISOString(), flow_claimed: false });
      if (saveError) throw new Error("Could not save sign-in credentials");
    } else {
      const { data: saved, error: saveError } = await admin.from("mcp_oauth_credentials").update({ ...encrypted, updated_at: new Date().toISOString(),
        ...(fresh ? { flow_digest: await stateDigest(fresh.state), flow_expires_at: new Date(Date.now() + 600000).toISOString(), flow_claimed: false } : {}) })
        .eq("connection_id", row.id).eq("user_id", row.user_id).eq("ciphertext", version).select("connection_id").maybeSingle();
      if (saveError || !saved) throw new Error("Connection changed during sign-in. Retry.");
    }
    version = encrypted.ciphertext;
  };
  const provider: OAuthClientProvider = {
    redirectUrl: `${material.origin}/mcp/callback`,
    clientMetadata: { client_name: "Forge", client_uri: material.origin, redirect_uris: [`${material.origin}/mcp/callback`], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" },
    tokens: () => material.tokens,
    saveTokens: async (tokens) => { material.tokens = tokens; await persist(); },
    clientInformation: () => material.client,
    saveClientInformation: async (client) => { material.client = client; material.dynamic = true; await persist(); },
    isClientInformationDynamicallyRegistered: () => material.dynamic === true,
    authorizationServerInformation: () => material.server,
    saveAuthorizationServerInformation: async (server) => { material.server = server; await persist(); },
    validateAuthorizationServerURL: async (_server, target) => { await verifyPublicTarget(String(target)); },
    state: () => material.state ?? crypto.randomUUID(),
    saveState: async (state) => { material.state = state; await persist(); },
    storedState: () => material.state,
    saveCodeVerifier: async (verifier) => { material.verifier = verifier; await persist(); },
    codeVerifier: () => { if (!material.verifier) throw new Error("Missing sign-in verifier"); return material.verifier; },
    redirectToAuthorization: async (url) => { await verifyPublicTarget(url.href); authUrl = url.href; },
    invalidateCredentials: async (scope, context) => {
      if (scope === "tokens" && context && canonicalJson(context.tokens) !== canonicalJson(material.tokens)) return;
      if (scope === "all" || scope === "client") { delete material.client; delete material.server; }
      if (scope === "all" || scope === "tokens") delete material.tokens;
      if (scope === "all" || scope === "verifier") delete material.verifier;
      await persist();
    },
  };
  const guarded = guardedMcpFetch(row.url, true);
  const oauthFetch: typeof fetch = async (input, init) => {
    const response = await guarded(input, init);
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (!material.client && material.origin.startsWith("https://") && response.ok && target.pathname.includes("/.well-known/")) {
      const metadata = await response.clone().json().catch(() => null) as { client_id_metadata_document_supported?: boolean; issuer?: string; token_endpoint?: string } | null;
      if (metadata?.client_id_metadata_document_supported && metadata.issuer && metadata.token_endpoint && new URL(metadata.issuer).origin === target.origin) {
        await verifyPublicTarget(metadata.token_endpoint);
        material.client = { client_id: mcpClientMetadata(material.origin).client_id, issuer: metadata.issuer, authorization_server: metadata.issuer, token_endpoint: metadata.token_endpoint };
        material.dynamic = false;
        await persist();
      }
    }
    return response;
  };
  return { provider, material, persist, getAuthUrl: () => authUrl, fetch: oauthFetch };
}

export async function openSavedMcp(sb: SupabaseClient<Database>, row: Connection) {
  const { openMcp } = await import("./mcp-client.server");
  const transport = row.transport_mode === "sse" ? "sse" : "http";
  if (row.auth_mode !== "oauth") return openMcp(row.url, row.ciphertext && row.iv ? await decryptSecret(row.ciphertext, row.iv) : undefined, transport);
  // RLS confirms caller ownership before privileged secret reads.
  const { data: owned } = await sb.from("mcp_connections").select("id").eq("id", row.id).eq("user_id", row.user_id).single();
  if (!owned || row.oauth_status !== "ready") throw new Error("Connection needs sign-in");
  const saved = await oauthProvider(row);
  try { return await openMcp(row.url, undefined, transport, saved.provider); }
  catch { await sb.from("mcp_connections").update({ state: "failed", oauth_status: "failed" }).eq("id", row.id).eq("user_id", row.user_id); throw new Error("Connection needs sign-in or recheck"); }
}

export async function finishOAuth(row: Connection, code: string, state: string, issuer?: string) {
  const saved = await oauthProvider(row);
  const result = await auth(saved.provider, { serverUrl: row.url, authorizationCode: code, callbackState: state, callbackIssuer: issuer, fetchFn: saved.fetch });
  if (result !== "AUTHORIZED") throw new Error("Sign-in did not complete");
  delete saved.material.verifier; delete saved.material.state; await saved.persist();
  return saved;
}