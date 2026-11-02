// Server-only derivations from the pairing secret.
async function hmacHex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Bearer key the runner accepts for its Ollama proxy; derived identically on both sides. */
export const localModelKey = (secret: string) => hmacHex(secret, "forge-ollama");
