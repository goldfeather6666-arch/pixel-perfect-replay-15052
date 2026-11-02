import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadDatabaseSettings, syncTaskDatabase } from "@/lib/deployment-settings.server";

const fake = vi.hoisted(() => ({ eq: vi.fn(), read: vi.fn(), decrypt: vi.fn(), key: vi.fn(), env: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const chain = { select: () => chain, eq: (...args: unknown[]) => { fake.eq(...args); return chain; }, maybeSingle: fake.read };
  return chain;
} } }));
vi.mock("@/lib/crypto.server", () => ({ decryptSecret: fake.decrypt }));
vi.mock("@/lib/customer-auth.server", () => ({ syncDeploymentAuth: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/project-setup.server", () => ({ selectedCustomDomain: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/integrations.server", () => ({
  SupabaseMgmt: class { anonKey = fake.key; },
  Vercel: class { setEnv = fake.env; },
}));
beforeEach(() => { vi.clearAllMocks(); fake.env.mockResolvedValue(undefined); });
describe("encrypted task deployment settings", () => {
  it("scopes credential reads to owner, task and linked database", async () => {
    fake.read.mockResolvedValue({ data: null, error: null });
    expect(await loadDatabaseSettings("owner", "task", "ref")).toBeNull();
    expect(fake.eq.mock.calls).toEqual([["task_id", "task"], ["user_id", "owner"], ["project_ref", "ref"]]);
  });
  it("uses saved settings without refetching keys and sends privileged values only server-side", async () => {
    fake.read.mockResolvedValue({ data: { ciphertext: "encrypted", iv: "iv" }, error: null });
    fake.decrypt.mockResolvedValue(JSON.stringify({ url: "https://ref.supabase.co", publicKey: "sb_publishable_test", serviceRoleKey: "server-test" }));
    await syncTaskDatabase("owner", "task", "ref", "website", "database-test", "vercel-test");
    expect(fake.key).not.toHaveBeenCalled();
    expect(fake.env.mock.calls[0]?.[0]).toBe("website");
    const vars = fake.env.mock.calls[0]?.[1];
    expect(Object.entries(vars).filter(([, v]) => v === "server-test")).toEqual([["SUPABASE_SERVICE_ROLE_KEY", "server-test"]]);
  });
  it("fails closed if a discovered key is privileged", async () => {
    fake.read.mockResolvedValue({ data: null, error: null });
    fake.key.mockResolvedValue("sb_secret_test");
    await expect(syncTaskDatabase("owner", "task", "ref", "website", "database-test", "vercel-test")).rejects.toThrow("public key validation failed");
    expect(fake.env).not.toHaveBeenCalled();
  });
});