import { describe, expect, it } from "vitest";
import { allowedMcpTool, connectionInput, isPublicIpv4, publicMcpUrl, readOnlyTool } from "@/lib/mcp-policy";

describe("MCP endpoint restrictions", () => {
  it("allows the official public HTTPS DeepWiki endpoint", () => {
    expect(publicMcpUrl("https://mcp.deepwiki.com/mcp")).toBe("https://mcp.deepwiki.com/mcp");
  });
  it.each(["http://example.com/mcp", "https://localhost/mcp", "https://127.0.0.1/mcp", "https://[::1]/mcp", "https://user:pass@example.com/mcp", "https://example.com:8443/mcp", "https://example.com/mcp?token=secret", "https://tools.internal/mcp"])("blocks unsafe endpoint %s", (url) => {
    expect(() => publicMcpUrl(url)).toThrow();
  });
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "224.0.0.1"])("blocks private or reserved DNS address %s", (ip) => expect(isPublicIpv4(ip)).toBe(false));
  it("allows public DNS addresses", () => expect(isPublicIpv4("104.18.1.1")).toBe(true));
  it("requires explicit server trust confirmation", () => {
    expect(connectionInput.safeParse({ name: "Docs", url: "https://mcp.deepwiki.com/mcp", token: "", trusted: false }).success).toBe(false);
  });
  it("excludes write, unknown and destructive tools", () => {
    expect(readOnlyTool({})).toBe(false);
    expect(readOnlyTool({ annotations: { readOnlyHint: false } })).toBe(false);
    expect(readOnlyTool({ annotations: { readOnlyHint: true, destructiveHint: true } })).toBe(false);
    expect(readOnlyTool({ annotations: { readOnlyHint: true } })).toBe(true);
  });
  it("allows only documented DeepWiki read tools on the exact official endpoint", () => {
    expect(allowedMcpTool("https://mcp.deepwiki.com/mcp", { name: "read_wiki_contents" })).toBe(true);
    expect(allowedMcpTool("https://mcp.deepwiki.com/mcp", { name: "generate_wiki" })).toBe(false);
    expect(allowedMcpTool("https://other.example/mcp", { name: "read_wiki_contents" })).toBe(false);
  });
});