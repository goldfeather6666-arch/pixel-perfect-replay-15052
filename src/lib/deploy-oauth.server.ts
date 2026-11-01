// One-click Vercel / database sign-in: single-use state bound to the browser, PKCE, encrypted tokens, refresh.
import { OAUTH_STATE_TTL_MS, authorizeUrl, callbackPath, needsRefresh, packVercelToken, randomToken, sha256b64url, type DeployOAuthProvider } from "./deploy-oauth";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`One-click ${name.startsWith("VERCEL") ? "Vercel" : "database"} sign-in isn't set up yet. Use a token instead, or ask the Forge owner to finish setup.`);
  return v;
}
function creds(p: DeployOAuthProvider) {
  return p === "vercel"
    ? { id: env("VERCEL_OAUTH_CLIENT_ID"), secret: env("VERCEL_OAUTH_CLIENT_SECRET"), slug: env("VERCEL_INTEGRATION_SLUG") }
    : { id: env("SB_MGMT_OAUTH_CLIENT_ID"), secret: env("SB_MGMT_OAUTH_CLIENT_SECRET"), slug: undefined };
}
export function oauthConfigured(p: DeployOAuthProvider) {
  const names = p === "vercel" ? ["VERCEL_OAUTH_CLIENT_ID", "VERCEL_OAUTH_CLIENT_SECRET", "VERCEL_INTEGRATION_SLUG"] : ["SB_MGMT_OAUTH_CLIENT_ID", "SB_MGMT_OAUTH_CLIENT_SECRET"];
  return names.every((n) => !!process.env[n]);
}

async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }

/** Creates a single-use attempt; returns the provider URL and the raw state (its digest goes in an HttpOnly cookie). */
export async function beginOAuth(userId: string, p: DeployOAuthProvider, origin: string) {
  const c = creds(p);
  const state = randomToken();
  const verifier = randomToken(48);
  const digest = await sha256b64url(state);
  const redirectUri = `${origin}${callbackPath(p)}`;
  const db = await admin();
  await db.from("deploy_oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error } = await db.from("deploy_oauth_states").insert({ state_digest: digest, user_id: userId, provider: p, verifier, redirect_uri: redirectUri, expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString() });
  if (error) throw new Error("Couldn't start sign-in");
  return { url: authorizeUrl(p, { clientId: c.id, redirectUri, state, challenge: await sha256b64url(verifier), vercelSlug: c.slug }), digest };
}

type Tokens = { access: string; refresh?: string | null; expiresIn?: number | null; teamId?: string | null };

async function tokenRequest(p: DeployOAuthProvider, body: Record<string, string>): Promise<Tokens> {
  const c = creds(p);
  const url = p === "vercel" ? "https://api.vercel.com/v2/oauth/access_token" : "https://api.supabase.com/v1/oauth/token";
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  const form = new URLSearchParams(body);
  if (p === "vercel") { form.set("client_id", c.id); form.set("client_secret", c.secret); }
  else headers.authorization = `Basic ${btoa(`${c.id}:${c.secret}`)}`;
  const res = await fetch(url, { method: "POST", headers, body: form, redirect: "error", signal: AbortSignal.timeout(20_000) });
  const j = await res.json().catch(() => ({})) as any;
  if (!res.ok || !j.access_token) throw new Error(`${p === "vercel" ? "Vercel" : "Database host"} refused the sign-in (${res.status})`);
  return { access: j.access_token, refresh: j.refresh_token ?? null, expiresIn: typeof j.expires_in === "number" ? j.expires_in : null, teamId: j.team_id ?? null };
}

/** Finishes a sign-in: claims the attempt once, checks the browser binding, exchanges the code and saves the account. */
export async function completeOAuth(p: DeployOAuthProvider, state: string, code: string, cookieDigest: string | undefined) {
  const digest = await sha256b64url(state);
  if (!cookieDigest || cookieDigest !== digest) throw new Error("Sign-in expired or was started in another browser. Start again from Settings.");
  const db = await admin();
  const { data: row } = await db.from("deploy_oauth_states").delete().eq("state_digest", digest).eq("provider", p).select("*").maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new Error("Sign-in expired. Start again from Settings.");
  const t = await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: row.redirect_uri, ...(p === "supabase" ? { code_verifier: row.verifier } : {}) });
  const access = p === "vercel" ? packVercelToken(t.access, t.teamId) : t.access;
  const { SupabaseMgmt, Vercel } = await import("./integrations.server");
  const who = p === "vercel" ? await new Vercel(access).identity() : await new SupabaseMgmt(access).identity();
  return saveOAuthAccount(db, row.user_id, p, access, t, `${who.name}${p === "vercel" && t.teamId ? " (team)" : ""}`);
}

async function saveOAuthAccount(db: any, userId: string, p: DeployOAuthProvider, access: string, t: Tokens, label: string) {
  const { encryptSecret } = await import("./crypto.server");
  const a = await encryptSecret(access);
  const r = t.refresh ? await encryptSecret(t.refresh) : null;
  const values = { ciphertext: a.ciphertext, iv: a.iv, last4: "auth", refresh_ciphertext: r?.ciphertext ?? null, refresh_iv: r?.iv ?? null, expires_at: t.expiresIn ? new Date(Date.now() + t.expiresIn * 1000).toISOString() : null };
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
