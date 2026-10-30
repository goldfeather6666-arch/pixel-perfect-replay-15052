import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const fake = vi.hoisted(() => ({ open: vi.fn(), inspect: vi.fn(), close: vi.fn() }));
vi.mock("@/lib/mcp-oauth.server", () => ({ openSavedMcp: fake.open }));
vi.mock("@/lib/mcp-client.server", () => ({ inspectMcp: fake.inspect }));
import { accessDiagnostics } from "@/lib/mcp-diagnostics.server";

function database(skillError: unknown = null) {
  const eq = vi.fn().mockReturnThis();
  const sb = { from: (table: string) => ({ select: vi.fn().mockReturnThis(), eq, order: vi.fn().mockReturnThis(), then: (resolve: (v: unknown) => void) => resolve(table === "skills" ? { data: [{ name: "animation", instructions: "Use purposeful motion", enabled: true }, { name: "paused", instructions: "Don't load", enabled: false }], error: skillError } : { data: [{ id: "framer", name: "Framer", url: "https://mcp.framer.com/mcp", enabled: true, state: "ready", allow_actions: true }], error: null }) }) } as unknown as SupabaseClient<Database>;
  return { sb, eq };
}
describe("caller-owned access checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.open.mockResolvedValue({ close: fake.close });
    fake.close.mockResolvedValue(undefined);
    fake.inspect.mockResolvedValue({ definitions: [{ name: "read_docs", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }], sdkTools: { read_docs: { execute: vi.fn() } } });
  });
  it("checks caller-owned skills and discovers tools without executing them", async () => {
    const { sb, eq } = database();
    const result = await accessDiagnostics(sb, "owner-1");
    expect(eq.mock.calls).toEqual([["user_id", "owner-1"], ["user_id", "owner-1"]]);
    expect(result.skills.items.map((s) => s.accessible)).toEqual([true, false]);
    expect(result.connections[0]?.tools[0]?.status).toBe("available");
    const inspected = await fake.inspect.mock.results[0]?.value;
    expect(inspected.sdkTools.read_docs.execute).not.toHaveBeenCalled();
    expect(fake.close).toHaveBeenCalledOnce();
  });
  it("does not claim skills are readable after a load error", async () => {
    const result = await accessDiagnostics(database({ code: "denied" }).sb, "owner-1");
    expect(result.skills.error).not.toBeNull();
    expect(result.skills.items.every((s) => !s.accessible)).toBe(true);
  });
  it("reports sanitized discovery failures and still closes clients", async () => {
    fake.inspect.mockRejectedValue(new Error("401 secret bearer token"));
    const result = await accessDiagnostics(database().sb, "owner-1");
    expect(result.connections[0]?.error).toContain("Authorization failed");
    expect(result.connections[0]?.error).not.toContain("secret");
    expect(fake.close).toHaveBeenCalledOnce();
  });
});