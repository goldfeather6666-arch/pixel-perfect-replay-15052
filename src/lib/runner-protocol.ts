// Shared, runtime-neutral protocol between Forge and an owner's self-hosted runner (e.g. Oracle free tier).
// Every request is HMAC-SHA256 signed with the per-owner pairing secret; the runner and Forge both verify.

export const RUNNER_PREFIX = "oci_";
export const RUNNER_ONLINE_MS = 2 * 60_000;
export const SIGNATURE_SKEW_MS = 5 * 60_000;

const enc = new TextEncoder();

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/** Public, non-secret identifier for a pairing secret. */
export async function runnerKeyId(secret: string) {
  return (await sha256Hex(`forge-runner:${secret}`)).slice(0, 20);
}

export function canonical(method: string, path: string, ts: string, body: string, bodyHash?: string) {
  return `${method.toUpperCase()}\n${path}\n${ts}\n${bodyHash ?? ""}${bodyHash ? "" : body}`;
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

export async function signRequest(secret: string, method: string, path: string, body: string, now = Date.now()) {
  const ts = String(now);
  const bodyHash = await sha256Hex(body);
  return { ts, signature: await hmac(secret, canonical(method, path, ts, "", bodyHash)) };
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifyRequest(secret: string, method: string, path: string, body: string, ts: string, signature: string, now = Date.now()) {
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > SIGNATURE_SKEW_MS) return false;
  const expected = await hmac(secret, canonical(method, path, ts, "", await sha256Hex(body)));
  return safeEqual(expected, String(signature || ""));
}

export type PairingCode = { url: string; secret: string };

/** Pairing code printed by the installer: base64url JSON { url, secret }. */
export function parsePairingCode(code: string): PairingCode {
  let raw: unknown;
  try {
    const b64 = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    raw = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    throw new Error("That pairing code is not valid. Copy the whole code your server printed.");
  }
  const r = raw as Partial<PairingCode>;
  if (typeof r.url !== "string" || typeof r.secret !== "string" || r.secret.length < 32) throw new Error("That pairing code is incomplete.");
  const url = normalizeEndpoint(r.url);
  return { url, secret: r.secret };
}

export function normalizeEndpoint(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Server address is not a valid URL."); }
  if (u.protocol !== "https:") throw new Error("Server address must use HTTPS.");
  if (u.username || u.password) throw new Error("Server address must not contain credentials.");
  return `https://${u.host}`;
}

export const isRunnerBoxId = (id: string | null | undefined) => !!id && id.startsWith(RUNNER_PREFIX);

export function runnerBoxId(keyId: string, box: string) {
  if (!/^[a-f0-9]{20}$/.test(keyId) || !/^[a-z0-9-]{6,64}$/.test(box)) throw new Error("Invalid runner workspace id");
  return `${RUNNER_PREFIX}${keyId}_${box}`;
}

export function parseRunnerBoxId(id: string) {
  const m = /^oci_([a-f0-9]{20})_([a-z0-9-]{6,64})$/.exec(id);
  return m ? { keyId: m[1]!, box: m[2]! } : null;
}

export type RunnerHealth = { status: string; last_seen: string | null; capacity?: { free_slots?: number } | null };

/** A runner is used only when recently heard from and not full; otherwise Forge falls back to E2B. */
export function runnerUsable(r: RunnerHealth | null | undefined, now = Date.now()) {
  if (!r || r.status !== "online" || !r.last_seen) return false;
  if (now - new Date(r.last_seen).getTime() > RUNNER_ONLINE_MS) return false;
  const free = r.capacity?.free_slots;
  return typeof free !== "number" || free > 0;
}

export type BoxProvider = "oracle" | "e2b";
export function providerOf(id: string | null | undefined): BoxProvider {
  return isRunnerBoxId(id) ? "oracle" : "e2b";
}
