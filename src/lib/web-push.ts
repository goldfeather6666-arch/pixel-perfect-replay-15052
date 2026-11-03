// Standards Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) using only Web Crypto,
// so it runs on the Worker runtime without Node libraries.
export const VAPID_PUBLIC_KEY = "BHJ_tnG_64iU3wafy5sRFqARht40yH1Yfsc_uOuVs4EfNgC-IYGnbC_jWN1SQP_7LIgTluxOkQpygviO5VjWFA8";

const enc = new TextEncoder();

export function b64uDecode(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
export function b64uEncode(u: Uint8Array): string {
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}

/** Encrypts a payload for one subscription (aes128gcm content coding). */
export async function encryptPayload(payload: string, p256dh: string, authSecret: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPub = b64uDecode(p256dh);
  const auth = b64uDecode(authSecret);
  const eph = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, concat(enc.encode(payload), new Uint8Array([2])) as BufferSource));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPub.length;
  return concat(header, asPub, cipher);
}

async function vapidJwt(endpoint: string, privateD: string): Promise<string> {
  const pub = b64uDecode(VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: privateD, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:notifications@forge.app" })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64uEncode(sig)}`;
}

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Sends one push. Returns "gone" when the browser dropped the subscription. */
export async function sendPush(sub: PushSub, msg: PushMessage, privateD: string): Promise<"ok" | "gone" | "failed"> {
  const url = new URL(sub.endpoint);
  if (url.protocol !== "https:") return "failed";
  const body = await encryptPayload(JSON.stringify(msg), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high", Authorization: `vapid t=${await vapidJwt(sub.endpoint, privateD)}, k=${VAPID_PUBLIC_KEY}` },
    body: body as BodyInit,
  }).catch(() => null);
  if (!res) return "failed";
  if (res.status === 404 || res.status === 410) return "gone";
  return res.ok ? "ok" : "failed";
}

/** Plain-language alert for how a run ended; null when no alert is worth sending. */
export function runAlert(stage: string, needsInput: boolean, title: string, sessionId: string): PushMessage | null {
  const url = `/s/${sessionId}`;
  const name = title.slice(0, 60) || "Your task";
  if (needsInput) return { title: "Forge needs you", body: `${name}: waiting for your approval or answer.`, url, tag: sessionId };
  if (stage === "FAILED") return { title: "Forge hit a problem", body: `${name}: the run stopped with an issue.`, url, tag: sessionId };
  if (stage === "STOPPED") return null;
  return { title: "Forge finished", body: `${name} is done.`, url, tag: sessionId };
}
