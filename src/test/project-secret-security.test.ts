import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitProjectSecret, listProjectSecrets } from "@/lib/project-setup.server";

const fake = vi.hoisted(() => ({ replies: [] as any[], filters: [] as any[], writes: [] as any[], selects: [] as string[], env: vi.fn(), project: vi.fn(), row: vi.fn(), token: vi.fn(), encrypt: vi.fn() }));
function from(table: string) {
  const chain: any = { select: (fields: string) => { fake.selects.push(fields); return chain; }, update: (body: unknown) => { fake.writes.push({ table, body }); return chain; }, eq: (...args: unknown[]) => { fake.filters.push(args); return chain; }, order: () => chain, maybeSingle: async () => fake.replies.shift(), then: (resolve: any) => Promise.resolve(fake.replies.shift()).then(resolve) };
  return chain;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/accounts.server", () => ({ accountRow: fake.row, accountToken: fake.token }));
vi.mock("@/lib/crypto.server", () => ({ encryptSecret: fake.encrypt }));
vi.mock("@/lib/integrations.server", () => ({ Vercel: class { project = fake.project; setEnv = fake.env; } }));
const ctx = { userId: "owner", supabase: { from } };
const session = { id: "task", repo: "owner/repo", vercel_project_id: "selected-project", accounts: { vercel: "selected-account" } };
beforeEach(() => { vi.clearAllMocks(); fake.replies = []; fake.filters = []; fake.writes = []; fake.selects = []; fake.row.mockResolvedValue({ id: "selected-account" }); fake.token.mockResolvedValue("token-fixture"); fake.project.mockResolvedValue({ repo: "owner/repo" }); fake.encrypt.mockResolvedValue({ ciphertext: "encrypted-fixture", iv: "iv-fixture" }); fake.env.mockResolvedValue(undefined); });
describe("secret submission ownership and consent", () => {
  it("encrypts stored data, pins destination and never returns plaintext", async () => {
    fake.replies = [{ data: session }, { data: { id: "request", name: "STRIPE_SECRET_KEY", state: "pending", targets: ["production"] } }, { data: [{ id: "request" }] }, { error: null }];
    const result = await submitProjectSecret(ctx, "task", "request", "private-test-fixture");
    expect(result).toEqual({ state: "synced", name: "STRIPE_SECRET_KEY" });
    expect(fake.encrypt).toHaveBeenCalledWith("private-test-fixture");
    expect(JSON.stringify(fake.writes)).not.toContain("private-test-fixture");
    expect(fake.env).toHaveBeenCalledWith("selected-project", { STRIPE_SECRET_KEY: "private-test-fixture" }, ["production"]);
    expect(fake.filters).toContainEqual(["vercel_account_id", "selected-account"]);
    expect(fake.filters).toContainEqual(["user_id", "owner"]);
  });
  it("rejects requests for another task/account before encryption or upload", async () => {
    fake.replies = [{ data: session }, { data: null }];
    await expect(submitProjectSecret(ctx, "task", "other-request", "fixture")).rejects.toThrow("not found");
    expect(fake.encrypt).not.toHaveBeenCalled(); expect(fake.env).not.toHaveBeenCalled();
  });
  it("rejects a website belonging to a different repo", async () => {
    fake.replies = [{ data: session }]; fake.project.mockResolvedValue({ repo: "other/repo" });
    await expect(submitProjectSecret(ctx, "task", "request", "fixture")).rejects.toThrow("repository");
    expect(fake.env).not.toHaveBeenCalled();
  });
  it("does not upload twice when another submission already claimed the request", async () => {
    fake.replies = [{ data: session }, { data: { id: "request", name: "STRIPE_SECRET_KEY", state: "pending", targets: ["production"] } }, { data: [] }];
    await expect(submitProjectSecret(ctx, "task", "request", "fixture")).rejects.toThrow("already being saved");
    expect(fake.env).not.toHaveBeenCalled();
  });
  it("exposes only request metadata to the browser and model", async () => {
    fake.replies = [{ data: session }, { data: [{ id: "request", name: "STRIPE_SECRET_KEY", state: "synced" }] }];
    await listProjectSecrets(ctx, "task");
    expect(fake.selects.at(-1)).toBe("id,name,purpose,source_url,targets,state,updated_at");
    expect(fake.selects.join(",")).not.toContain("ciphertext");
    expect(fake.project).not.toHaveBeenCalled();
  });
});