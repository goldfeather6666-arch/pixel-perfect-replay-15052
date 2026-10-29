import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ close: vi.fn(), execute: vi.fn(), create: vi.fn() }));
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: fake.create }));
vi.mock("@/lib/crypto.server", () => ({ decryptSecret: vi.fn() }));
import { loadMcpTools } from "@/lib/mcp-client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

describe("external agent tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ Answer: [{ type: 1, data: "104.18.1.1" }] }) }));
    fake.create.mockResolvedValue({
      listTools: async () => ({ tools: [
        { name: "read", description: "Read docs", inputSchema: { type: "object", properties: { repo: { type: "string" } }, required: ["repo"] }, annotations: { readOnlyHint: true } },
        { name: "delete", inputSchema: {}, annotations: { readOnlyHint: false } },
      ] }),
      toolsFromDefinitions: () => ({ read: { execute: fake.execute } }),
      close: fake.close,
    });
    fake.execute.mockResolvedValue({ content: [{ type: "text", text: "documentation" }] });
  });

  it("scopes connections to the caller and refuses unknown/write tools and invalid arguments", async () => {
    const eq = vi.fn().mockReturnThis();
    const query = { select: vi.fn().mockReturnThis(), eq, then: (resolve: (v: unknown) => void) => resolve({ data: [{ id: "abc", name: "Docs", url: "https://docs.example.com/mcp" }], error: null }) };
    const sb = { from: () => query } as unknown as SupabaseClient<Database>;
    const registry = await loadMcpTools(sb, "owner-1");
    expect(eq).toHaveBeenCalledWith("user_id", "owner-1");
    expect(eq).toHaveBeenCalledWith("enabled", true);
    const options = { toolCallId: "test-call", messages: [], context: {} };
    const found = await registry.tools.tool_search.execute({ query: "docs", limit: 8 }, options);
    if (!("matches" in found)) throw new Error("Expected search result");
    expect(found.matches.map((t) => t.name)).toEqual(["mcp_abc.read"]);
    expect(await registry.tools.tool_invoke.execute({ name: "mcp_abc.delete", arguments: {} }, options)).toEqual({ error: "Unknown or disabled external tool" });
    expect(await registry.tools.tool_invoke.execute({ name: "mcp_abc.read", arguments: {} }, options)).toEqual({ error: "Invalid arguments for external tool" });
    expect(fake.execute).not.toHaveBeenCalled();
    await registry.tools.tool_invoke.execute({ name: "mcp_abc.read", arguments: { repo: "facebook/react" } }, options);
    expect(fake.execute).toHaveBeenCalledWith({ repo: "facebook/react" });
    await registry.close();
    expect(fake.close).toHaveBeenCalledOnce();
  });
});