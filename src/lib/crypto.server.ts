// AES-GCM encryption for user-supplied credentials. Key material lives only in server secrets.
function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function getKey() {
  const secret = process.env["KEY_ENCRYPTION_SECRET"];
  if (!secret) throw new Error("Server encryption key is not configured");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(plain));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv) };
}

export async function decryptSecret(ciphertext: string, iv: string) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await getKey(), unb64(ciphertext));
  return new TextDecoder().decode(pt);
}

export function utf8ToB64(s: string) {
  return b64(new TextEncoder().encode(s));
}
export function b64ToUtf8(s: string) {
  return new TextDecoder().decode(unb64(s.replace(/\n/g, "")));
}
