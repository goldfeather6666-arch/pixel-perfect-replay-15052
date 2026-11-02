// Pure helpers for one-click Vercel / database (Supabase Management API) sign-in. No secrets here.
export type DeployOAuthProvider = "vercel" | "supabase";

export const OAUTH_STATE_TTL_MS = 30 * 60_000;
/** Refresh access tokens this long before they expire so a run never starts with a dying token. */
export const REFRESH_SKEW_MS = 2 * 60_000;

export function callbackPath(p: DeployOAuthProvider) { return `/api/public/oauth/${p}/callback`; }
/** The return address the provider must be told to use: exactly the one its own console lists. */
export function redirectUriFor(p: DeployOAuthProvider, origin: string) { return `${origin.replace(/\/+$/, "")}${callbackPath(p)}`; }

export function authorizeUrl(p: DeployOAuthProvider, o: { clientId: string; redirectUri: string; state: string; challenge: string; vercelSlug?: string }) {
  if (p === "vercel") {
    // Vercel Integration install flow: the user picks a scope, Vercel returns code + configurationId (+ teamId).
    if (!o.vercelSlug) throw new Error("Vercel integration slug missing");
    const u = new URL(`https://vercel.com/integrations/${encodeURIComponent(o.vercelSlug)}/new`);
    u.searchParams.set("state", o.state);
    return u.toString();
  }
  const u = new URL("https://api.supabase.com/v1/oauth/authorize");
  u.searchParams.set("client_id", o.clientId);
  u.searchParams.set("redirect_uri", o.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", o.state);
  u.searchParams.set("code_challenge", o.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export function needsRefresh(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) - now <= REFRESH_SKEW_MS;
}

/** Vercel team-installed tokens must send teamId on every call; it rides with the token so every caller gets it. */
const TEAM_SEP = "|team:";
export function packVercelToken(token: string, teamId?: string | null) { return teamId ? `${token}${TEAM_SEP}${teamId}` : token; }
export function unpackVercelToken(packed: string) {
  const i = packed.indexOf(TEAM_SEP);
  return i < 0 ? { token: packed, teamId: null as string | null } : { token: packed.slice(0, i), teamId: packed.slice(i + TEAM_SEP.length) || null };
}
export function withTeam(path: string, teamId: string | null) {
  if (!teamId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}`;
}

function b64url(bytes: Uint8Array) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function randomToken(n = 32) { return b64url(crypto.getRandomValues(new Uint8Array(n))); }
export async function sha256b64url(s: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}
