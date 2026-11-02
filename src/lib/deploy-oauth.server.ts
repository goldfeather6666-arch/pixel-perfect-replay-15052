// One-click Vercel / database sign-in: single-use state bound to the browser, PKCE, encrypted tokens, refresh.
import { OAUTH_STATE_TTL_MS, authorizeUrl, needsRefresh, packVercelToken, randomToken, redirectUriFor, sha256b64url, type DeployOAuthProvider } from "./deploy-oauth";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`One-click ${name.startsWith("VERCEL") ? "Vercel" : "database"} sign-in isn't set up yet. Use a token instead, or ask the Forge owner to finish setup.`);
  return v;
}
function creds(p: DeployOAuthProvider) {
  return p === "vercel"
    ? { id: env("VERCEL_CLIENT_ID"), secret: env("VERCEL_CLIENT_SECRET"), slug: env("VERCEL_TEAM_SLUG") }
    : { id: env("FORGE_SUPABASE_OAUTH_CLIENT_ID"), secret: env("FORGE_SUPABASE_OAUTH_CLIENT_SECRET"), slug: undefined };
}
export function oauthConfigured(p: DeployOAuthProvider) {
  const names = p === "vercel" ? ["VERCEL_CLIENT_ID", "VERCEL_CLIENT_SECRET", "VERCEL_TEAM_SLUG"] : ["FORGE_SUPABASE_OAUTH_CLIENT_ID", "FORGE_SUPABASE_OAUTH_CLIENT_SECRET"];
  return names.every((n) => !!process.env[n]);
}

async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }

/** Creates a single-use attempt; returns the provider URL and the raw state (its digest goes in an HttpOnly cookie). */
export async function beginOAuth(userId: string, p: DeployOAuthProvider, origin: string) {
  const c = creds(p);
  const state = randomToken();
  const verifier = randomToken(48);
  const digest = await sha256b64url(state);
  const redirectUri = redirectUriFor(p, origin);
  const db = await admin();
  await db.from("deploy_oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error } = await db.from("deploy_oauth_states").insert({ state_digest: digest, user_id: userId, provider: p, verifier, redirect_uri: redirectUri, expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString() });
  if (error) throw new Error("Couldn't start sign-in");
  return { url: authorizeUrl(p, { clientId: c.id, redirectUri, state, challenge: await sha256b64url(verifier), vercelSlug: c.slug }), digest };
}

type Tokens = { access: string; refresh?: string | null; expiresIn?: number | null; teamId?: string | null; installationId?: string | null };

async function tokenRequest(p: DeployOAuthProvider, body: Record<string, string>): Promise<Tokens> {
  const c = creds(p);
  const url = p === "vercel" ? "https://api.vercel.com/v2/oauth/access_token" : "https://api.supabase.com/v1/oauth/token";
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  const form = new URLSearchParams(body);
  if (p === "vercel") { form.set("client_id", c.id); form.set("client_secret", c.secret); }
  else headers["authorization"] = `Basic ${btoa(`${c.id}:${c.secret}`)}`;
  const res = await fetch(url, { method: "POST", headers, body: form, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  const j = await res.json().catch(() => ({})) as any;
  if (!res.ok || !j.access_token) {
    // Provider error codes/descriptions are safe to show (never contain our secret); keep them short and single-line.
    const why = String(j.error_description ?? j.error?.message ?? j.message ?? j.error ?? "").replace(/[\r\n]+/g, " ").slice(0, 200);
    // The return address is the usual cause of a refusal, so record the one we sent (it is not a secret).
    console.error(`${p} token exchange refused`, res.status, `redirect_uri=${body["redirect_uri"] ?? ""}`, why);
    throw new Error(`${p === "vercel" ? "Vercel" : "Database host"} refused the sign-in (${res.status})${why ? `: ${why}` : ""}`);
  }
  return { access: j.access_token, refresh: j.refresh_token ?? null, expiresIn: typeof j.expires_in === "number" ? j.expires_in : null, teamId: j.team_id ?? null, installationId: j.installation_id ?? null };
}

/** Finishes a sign-in: claims the attempt once, checks the browser binding, exchanges the code and saves the account. */
export async function completeOAuth(p: DeployOAuthProvider, state: string, code: string, binding: { cookieDigest?: string | undefined; userId?: string | undefined }, extra?: { origin?: string | undefined; configurationId?: string | undefined }) {
  const digest = await sha256b64url(state);
  // Bound either to this browser's HttpOnly cookie, or (when the provider dropped it) to the signed-in user who started it.
  if (!binding.userId && binding.cookieDigest !== digest) throw new Error("Sign-in expired or was started in another browser. Start again from Settings.");
  const db = await admin();
  const { data: row } = await db.from("deploy_oauth_states").delete().eq("state_digest", digest).eq("provider", p).select("*").maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new Error("Sign-in expired. Start again from Settings.");
  if (binding.userId && row.user_id !== binding.userId) throw new Error("This sign-in was started by a different account.");
  // A provider only ever sends the browser back to an address its own console allows, so the one it just used is the
  // configured one. Trusting it beats the address this tab happens to be on (a preview or localhost origin differs).
  const redirectUri = extra?.origin ? redirectUriFor(p, extra.origin) : row.redirect_uri;
  const t = await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri, ...(p === "supabase" ? { code_verifier: row.verifier } : {}) });
  const access = p === "vercel" ? packVercelToken(t.access, t.teamId) : t.access;
  const { SupabaseMgmt, Vercel } = await import("./integrations.server");
  const who = p === "vercel" ? await new Vercel(access).identity() : await new SupabaseMgmt(access).identity();
  return saveOAuthAccount(db, row.user_id, p, access, t, `${who.name}${p === "vercel" && t.teamId ? " (team)" : ""}`, extra?.configurationId);
}

async function saveOAuthAccount(db: any, userId: string, p: DeployOAuthProvider, access: string, t: Tokens, label: string, configurationId?: string | undefined) {
  const { encryptSecret } = await import("./crypto.server");
  const a = await encryptSecret(access);
  const r = t.refresh ? await encryptSecret(t.refresh) : null;
  const values = { ciphertext: a.ciphertext, iv: a.iv, last4: "auth", refresh_ciphertext: r?.ciphertext ?? null, refresh_iv: r?.iv ?? null, expires_at: t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000).toISOString() : null, base_url: p === "vercel" ? (configurationId ?? t.installationId ?? null) : null };
  // Signing in again to the same account replaces its tokens instead of adding a duplicate.
  const { data: existing } = await db.from("provider_credentials").select("id").eq("user_id", userId).eq("provider", p).eq("auth_method", "oauth").eq("label", label).maybeSingle();
  if (existing) await db.from("provider_credentials").update(values).eq("id", existing.id).eq("user_id", userId);
  else await db.from("provider_credentials").insert({ ...values, user_id: userId, provider: p, label, auth_method: "oauth" });
  return { label };
}

/** Returns a fresh access token for a signed-in account, refreshing (and saving) it when close to expiry. */
export async function freshOAuthToken(row: any): Promise<string> {
  const { decryptSecret, encryptSecret } = await import("./crypto.server");
  const current = await decryptSecret(row.ciphertext, row.iv);
  if (!needsRefresh(row.expires_at) || !row.refresh_ciphertext) return current;
  const refresh = await decryptSecret(row.refresh_ciphertext, row.refresh_iv);
  const t = await tokenRequest(row.provider, { grant_type: "refresh_token", refresh_token: refresh });
  const a = await encryptSecret(t.access);
  const r = t.refresh ? await encryptSecret(t.refresh) : null;
  const db = await admin();
  // Only overwrite if nobody else refreshed first (compare-and-swap on the old ciphertext).
  await db.from("provider_credentials").update({ ciphertext: a.ciphertext, iv: a.iv, expires_at: t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000).toISOString() : null, ...(r ? { refresh_ciphertext: r.ciphertext, refresh_iv: r.iv } : {}) })
    .eq("id", row.id).eq("user_id", row.user_id).eq("ciphertext", row.ciphertext);
  return t.access;
}

/** Disconnect: revokes the provider-side grant (best effort) for a one-click account. Pasted-token accounts are never touched. */
export async function revokeOAuthAccount(row: any) {
  if (row?.auth_method !== "oauth") return;
  const { decryptSecret } = await import("./crypto.server");
  try {
    if (row.provider === "vercel") {
      const { unpackVercelToken, withTeam } = await import("./deploy-oauth");
      const { token, teamId } = unpackVercelToken(await decryptSecret(row.ciphertext, row.iv));
      if (row.base_url) await fetch(`https://api.vercel.com${withTeam(`/v1/integrations/configuration/${encodeURIComponent(row.base_url)}`, teamId)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    } else if (row.provider === "supabase" && row.refresh_ciphertext) {
      const c = creds("supabase");
      await fetch("https://api.supabase.com/v1/oauth/revoke", { method: "POST", headers: { "content-type": "application/json", authorization: `Basic ${btoa(`${c.id}:${c.secret}`)}` }, body: JSON.stringify({ client_id: c.id, client_secret: c.secret, refresh_token: await decryptSecret(row.refresh_ciphertext, row.refresh_iv) }), redirect: "manual", signal: AbortSignal.timeout(15_000) });
    }
  } catch (e) { console.error("oauth revoke failed", row.provider, e instanceof Error ? e.message : "error"); }
}
