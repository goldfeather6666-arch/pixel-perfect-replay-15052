import { describe, it, expect } from "vitest";
import { encryptPayload, runAlert, b64uEncode } from "./web-push";

async function decrypt(body: Uint8Array, uaPriv: CryptoKey, uaPub: Uint8Array, auth: Uint8Array) {
  const enc = new TextEncoder();
  const hmac = async (k: Uint8Array, d: Uint8Array) => new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", k as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), d as BufferSource));
  const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
  const salt = body.slice(0, 16); const asPub = body.slice(21, 86); const ct = body.slice(86);
  const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, uaPriv, 256));
  const ikm = await hmac(await hmac(auth, shared), cat(enc.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), ct));
  return new TextDecoder().decode(pt.slice(0, -1));
}

describe("web push", () => {
  it("encrypts a payload the browser can decrypt", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const uaPub = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const body = await encryptPayload('{"title":"hi"}', b64uEncode(uaPub), b64uEncode(auth));
    expect(await decrypt(body, ua.privateKey, uaPub, auth)).toBe('{"title":"hi"}');
  });
  it("alerts on finish, failure and waiting, never on Stop", () => {
    expect(runAlert("DONE", false, "Shop", "1")?.title).toBe("Forge finished");
    expect(runAlert("FAILED", false, "Shop", "1")?.title).toBe("Forge hit a problem");
    expect(runAlert("DONE", true, "Shop", "1")?.title).toBe("Forge needs you");
    expect(runAlert("STOPPED", false, "Shop", "1")).toBeNull();
  });
});
