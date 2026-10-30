import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
const fake = vi.hoisted(() => ({ row: null as unknown, write: vi.fn(), encrypt: vi.fn(), auth: vi.fn() }));
vi.mock("@ai-sdk/mcp", () => ({ auth: fake.auth }));
vi.mock("@/lib/crypto.server", () => ({ encryptSecret: fake.encrypt, decryptSecret: async (v: string) => v }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: fake.row }), insert: async (v: unknown) => { fake.write(v); return {}; }, update: (v: unknown) => { fake.write(v); const save = { eq: () => save, select: () => save, maybeSingle: async () => ({ data: { connection_id: "one" } }) }; return save; } };
  return chain;
} } }));
import { oauthProvider, finishOAuth, stateDigest } from "@/lib/mcp-oauth.server";
import { verifyPublicTarget, guardedMcpFetch } from "@/lib/mcp-network.server";
const row = { id: "one", user_id: "owner", url: "https://tools.example.com/mcp" } as Database["public"]["Tables"]["mcp_connections"]["Row"];

describe("private external OAuth", () => {
  beforeEach(() => { vi.clearAllMocks(); fake.row = null; fake.encrypt.mockImplementation(async () => ({ ciphertext: "encrypted-only", iv: "iv" })); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ Answer: [{ type: 1, data: "104.18.1.1" }] }) })); });
  it("encrypts tokens, registration and PKCE before durable writes", async () => {
    const { provider } = await oauthProvider(row, { origin: "http://localhost:8080", state: "private-state" });
    await provider.saveClientInformation?.({ client_id: "client" });
    await provider.saveCodeVerifier("private-verifier");
    await provider.saveTokens({ access_token: "private-token", token_type: "Bearer", refresh_token: "private-refresh" });
    expect(fake.encrypt).toHaveBeenLastCalledWith(expect.stringContaining("private-token"));
    expect(fake.write).toHaveBeenLastCalledWith(expect.objectContaining({ ciphertext: "encrypted-only", iv: "iv" }));
    expect(JSON.stringify(fake.write.mock.calls)).not.toContain("private-token");
    expect(JSON.stringify(fake.write.mock.calls)).not.toContain("private-verifier");
    expect(provider.redirectUrl).toBe("http://localhost:8080/mcp/callback");
  });
  it("retains callback state and passes state/issuer to the SDK", async () => {
    fake.row = { ciphertext: JSON.stringify({ origin: "https://forge.example.com", state: "expected", verifier: "verifier" }) };
    fake.auth.mockResolvedValue("AUTHORIZED");
    await finishOAuth(row, "code", "expected", "https://auth.example.com");
    expect(fake.auth).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ authorizationCode: "code", callbackState: "expected", callbackIssuer: "https://auth.example.com" }));
    expect(fake.encrypt).toHaveBeenCalledWith(JSON.stringify({ origin: "https://forge.example.com" }));
  });
  it("hashes state deterministically without storing its raw value in flow columns", async () => {
    expect(await stateDigest("expected")).toBe(await stateDigest("expected"));
    expect(await stateDigest("expected")).not.toBe(await stateDigest("other"));
    expect(await stateDigest("expected")).toHaveLength(64);
  });
  it("rejects private DNS discovered through OAuth metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ Answer: [{ type: 1, data: "10.0.0.1" }] }) }));
    await expect(verifyPublicTarget("https://auth.example.com/token")).rejects.toThrow("public internet");
  });
  it("does not follow OAuth endpoint redirects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: string) => String(input).includes("cloudflare-dns") ? { json: async () => ({ Answer: [{ type: 1, data: "104.18.1.1" }] }) } : { status: 302 }));
    await expect(guardedMcpFetch(row.url, true)("https://auth.example.com/token")).rejects.toThrow("redirects");
  });
});