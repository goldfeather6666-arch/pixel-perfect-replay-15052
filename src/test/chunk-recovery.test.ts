import { describe, expect, it } from "vitest";
import { chunkRecoveryUrl, isChunkLoadError } from "@/lib/chunk-recovery";

describe("stale route recovery", () => {
  it("recognizes module failures without retrying unrelated errors", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/route-old.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Database permission denied"))).toBe(false);
  });
  it("changes the document URL while preserving task, query and hash", () => {
    const url = new URL(chunkRecoveryUrl("https://forge.test/s/task?tab=deploy#saved", 100_000, 0) ?? "https://invalid.test");
    expect(url.pathname).toBe("/s/task");
    expect(url.searchParams.get("tab")).toBe("deploy");
    expect(url.searchParams.get("_forge_refresh")).toBe("100000");
    expect(url.hash).toBe("#saved");
  });
  it("bounds retries even when storage is unavailable", () => {
    expect(chunkRecoveryUrl("https://forge.test/?_forge_refresh=100000", 110_000, 0)).toBeNull();
    expect(chunkRecoveryUrl("https://forge.test/", 110_000, 100_000)).toBeNull();
    expect(chunkRecoveryUrl("https://forge.test/?_forge_refresh=100000", 160_001, 0)).not.toBeNull();
  });
});