import { describe, it, expect } from "vitest";
import { rankMemories } from "@/lib/engine/memory-rank";
import { buildCheckpoint, isInterrupted } from "@/lib/engine/checkpoint";
import { freshCachedTools, toCache, MCP_CACHE_TTL_MS } from "@/lib/mcp-cache";

const now = Date.parse("2026-11-01T00:00:00Z");
const at = (d: number) => new Date(now - d * 86_400_000).toISOString();

describe("memory ranking", () => {
  it("puts topic matches above newer unrelated notes", () => {
    const m = [
      { category: "project", content: "UI uses Tailwind tokens", updated_at: at(0) },
      { category: "error", content: "Stripe webhook failed: missing signing secret", updated_at: at(60) },
    ];
    expect(rankMemories(m, "fix the stripe webhooks", 1, now)[0]!.category).toBe("error");
  });
  it("respects the limit", () => {
    const m = Array.from({ length: 50 }, (_, i) => ({ category: "project", content: `note ${i}`, updated_at: at(i) }));
    expect(rankMemories(m, "x", 40, now)).toHaveLength(40);
  });
});

describe("resume checkpoint", () => {
  it("treats only unfinished runs as interrupted", () => {
    expect(isInterrupted({ stage: "EXECUTING", ended_at: null }, false)).toBe(true);
    expect(isInterrupted({ stage: "COMPLETED", ended_at: null }, false)).toBe(false);
    expect(isInterrupted({ stage: "EXECUTING", ended_at: null }, true)).toBe(false);
  });
  it("summarizes completed tools", () => {
    const t = buildCheckpoint({ objective: "Add login", stage: "EXECUTING", started_at: at(0) }, [
      { type: "tool.execution.completed", payload: { tool: "write_file", ok: true } },
      { type: "tool.execution.completed", payload: { tool: "write_file", ok: false } },
    ]);
    expect(t).toContain("write_file×2 (1 failed)");
  });
});

describe("external tool cache", () => {
  const row = { url: "https://a.example/mcp", tool_cache: [{ name: "t", inputSchema: {} }], tool_cache_url: "https://a.example/mcp", tool_cache_at: new Date(now - 1000).toISOString() };
  it("uses a fresh cache for the same address", () => expect(freshCachedTools(row, now)).toHaveLength(1));
  it("ignores a cache saved for another address", () => expect(freshCachedTools({ ...row, url: "https://b.example/mcp" }, now)).toBeNull());
  it("expires after the time limit", () => expect(freshCachedTools(row, now + MCP_CACHE_TTL_MS + 5000)).toBeNull());
  it("refuses oversized lists", () => expect(toCache([{ name: "big", inputSchema: { d: "x".repeat(500_000) } }])).toBeNull());
});
