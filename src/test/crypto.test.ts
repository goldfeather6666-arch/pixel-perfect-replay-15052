import { describe, expect, it, beforeAll } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto.server";

describe("credential encryption", () => {
  beforeAll(() => {
    process.env["KEY_ENCRYPTION_SECRET"] = "test-secret-for-unit-tests-only-0123456789";
  });
  it("never stores the key in plaintext and round-trips", async () => {
    const key = "sk-test-abcdef123456";
    const enc = await encryptSecret(key);
    expect(enc.ciphertext).not.toContain(key);
    expect(await decryptSecret(enc.ciphertext, enc.iv)).toBe(key);
  });
});
