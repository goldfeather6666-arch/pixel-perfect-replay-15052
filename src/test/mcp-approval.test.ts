import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ open: vi.fn(), inspect: vi.fn(), execute: vi.fn(), close: vi.fn(), update: vi.fn(), claim: true }));
vi.mock("@/lib/mcp-client.server", () => ({ openMcp: mocks.open, inspectMcp: mocks.inspect }));
vi.mock("@/lib/mcp-oauth.server", () => ({ openSavedMcp: mocks.open }));
vi.mock("@/lib/crypto.server", () => ({ decryptSecret: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ update: mocks.update }) } }));
import { resolveMcpAction } from "@/lib/mcp-approval.server";

const schema = { type: "object", properties: { issue: { type: "string" } }, required: ["issue"] };
function database(overrides: Record<string, unknown> = {}, connectionAvailable = true, requestAvailable = true) {
  const row = { id: "request-1", state: "pending", session_id: "task-1", connection_id: "connection-1", server_url: "https://docs.example.com/mcp", transport_mode: "http", tool_name: "delete", input_schema: schema, arguments: { issue: "issue-4" }, expires_at: new Date(Date.now() + 60000).toISOString(), ...overrides };
  const filters: unknown[][] = [];
  const sb = { from: (table: string) => {
    const chain = { select: () => chain, eq: (...args: unknown[]) => { filters.push(args); return chain; }, single: async () => ({ data: table === "mcp_action_requests" ? requestAvailable ? row : null : table === "agent_sessions" ? { id: "task-1" } : connectionAvailable ? { url: row.server_url, transport_mode: "http", enabled: true, allow_actions: true } : null }) };
    return chain;
  } } as unknown as SupabaseClient<Database>;
  return { sb, filters };
}

describe("external action consent", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.claim = true;
    mocks.close.mockResolvedValue(undefined);
    mocks.open.mockResolvedValue({ close: mocks.close });
    mocks.inspect.mockResolvedValue({ definitions: [{ name: "delete", inputSchema: schema }], sdkTools: { delete: { execute: mocks.execute } } });
    mocks.execute.mockResolvedValue({ content: [{ type: "text", text: "Deleted issue-4" }] });
    mocks.update.mockImplementation(() => {
      const chain = { eq: () => chain, select: () => chain, maybeSingle: async () => ({ data: mocks.claim ? { id: "request-1" } : null }) };
      return chain;
    });
  });
  it("rejects without calling the remote tool", async () => {
    const { sb } = database();
    await resolveMcpAction(sb, "owner-1", "request-1", false);
    expect(mocks.update).toHaveBeenCalledWith({ state: "rejected" });
    expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("executes only saved arguments and scopes reads to the owner", async () => {
    const { sb, filters } = database();
    expect(await resolveMcpAction(sb, "owner-1", "request-1", true)).toMatchObject({ ok: true });
    expect(filters.filter(([key, value]) => key === "user_id" && value === "owner-1")).toHaveLength(3);
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith({ issue: "issue-4" });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded", result: expect.stringContaining("Deleted issue-4") }));
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("blocks a second or concurrent claim", async () => {
    mocks.claim = false;
    await expect(resolveMcpAction(database().sb, "owner-1", "request-1", true)).rejects.toThrow("already being resolved");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("blocks expired approvals", async () => {
    await resolveMcpAction(database({ expires_at: "2020-01-01" }).sb, "owner-1", "request-1", true);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ state: "failed" }));
  });
  it("blocks changed tool schemas and still closes the client", async () => {
    mocks.inspect.mockResolvedValue({ definitions: [{ name: "delete", inputSchema: {} }], sdkTools: { delete: { execute: mocks.execute } } });
    await resolveMcpAction(database().sb, "owner-1", "request-1", true);
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("does not execute requests already resolved", async () => {
    await expect(resolveMcpAction(database({ state: "succeeded" }).sb, "owner-1", "request-1", true)).rejects.toThrow("already resolved");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("blocks unavailable or cross-owner requests before privileged access", async () => {
    const { sb, filters } = database({}, true, false);
    await expect(resolveMcpAction(sb, "other-owner", "request-1", true)).rejects.toThrow("unavailable");
    expect(filters).toContainEqual(["user_id", "other-owner"]);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("blocks disabled, removed or cross-owner connections", async () => {
    const { sb, filters } = database({}, false);
    expect(await resolveMcpAction(sb, "owner-1", "request-1", true)).toMatchObject({ ok: false });
    expect(filters).toContainEqual(["enabled", true]); expect(filters).toContainEqual(["allow_actions", true]);
    expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
});