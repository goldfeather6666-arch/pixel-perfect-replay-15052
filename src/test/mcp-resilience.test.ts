import { describe, expect, it, vi } from "vitest";
import { isTransientMcpError, runMcpOperation } from "@/lib/mcp-resilience";

describe("MCP operation resilience", () => {
  it("retries a transient failure once for a read-only tool", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("fetch failed: ECONNRESET"))
      .mockResolvedValueOnce({ content: "ok" });
    const result = await runMcpOperation(operation, { readOnly: true, delayMs: 0 });
    expect(result.value).toEqual({ content: "ok" });
    expect(result.attempts).toBe(2);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("never retries a write operation", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("HTTP 503 temporary provider failure"));
    await expect(runMcpOperation(operation, { readOnly: false, delayMs: 0 })).rejects.toThrow("503");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not retry a permanent validation failure", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Invalid arguments"));
    await expect(runMcpOperation(operation, { readOnly: true, delayMs: 0 })).rejects.toThrow("Invalid arguments");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("recognizes transient provider and network failures", () => {
    expect(isTransientMcpError(new Error("HTTP 429 rate limit"))).toBe(true);
    expect(isTransientMcpError(new Error("socket hang up"))).toBe(true);
    expect(isTransientMcpError(new Error("invalid schema"))).toBe(false);
  });

  it("bounds retries to one even if a caller requests more", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("HTTP 503"));
    await expect(runMcpOperation(operation, { readOnly: true, retries: 10, delayMs: 0 })).rejects.toThrow("503");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("fails a hung operation at the configured timeout without retrying", async () => {
    const operation = vi.fn(() => new Promise<never>(() => {}));
    await expect(runMcpOperation(operation, { readOnly: true, timeoutMs: 1000, delayMs: 0 })).rejects.toThrow("timed out");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
