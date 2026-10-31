// Short-lived signed preview access tokens (HMAC-SHA256). Tokens are never stored; revocation works by
// bumping preview_sessions.token_version, which invalidates every outstanding token for that preview.

export type PreviewClaims = { p: string; u: string; v: number; e: number; k: "own" | "share" };

const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(`forge-preview:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signPreviewToken(claims: PreviewClaims, secret: string) {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** Returns claims when the signature is valid and unexpired; null otherwise. */
export async function verifyPreviewToken(token: string, secret: string, now = Date.now()): Promise<PreviewClaims | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig || token.length > 2000) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64url(body))) as PreviewClaims;
    if (typeof c.e !== "number" || c.e < now || !c.p || !c.u || (c.k !== "own" && c.k !== "share")) return null;
    return c;
  } catch {
    return null;
  }
}

export function previewSecret() {
  const s = process.env["KEY_ENCRYPTION_SECRET"];
  if (!s) throw new Error("Preview signing is not configured");
  return s;
}
