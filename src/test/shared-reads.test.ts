import { describe, expect, it, vi } from "vitest";
import { sharedReads } from "@/lib/shared-reads";

describe("shared repository reads", () => {
  it("coalesces master/helper reads and refreshes after invalidation", async () => {
    const load = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    const cache = sharedReads<string>(load);
    expect(await Promise.all([cache.read("a"), cache.read("a"), cache.read("a")])).toEqual(["old", "old", "old"]);
    expect(load).toHaveBeenCalledTimes(1);
    cache.clear();
    expect(await cache.read("a")).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("shares one concurrency bound across independent batches", async () => {
    let active = 0;
    let peak = 0;
    const cache = sharedReads(async (path) => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--; return path;
    }, 6);
    await Promise.all(Array.from({ length: 30 }, (_, i) => cache.read(String(i))));
    expect(peak).toBe(6);
    expect(active).toBe(0);
  });
  it("does not cache network failures as missing files", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("ok");
    const cache = sharedReads<string>(load);
    await expect(cache.read("a")).rejects.toThrow("offline");
    expect(await cache.read("a")).toBe("ok");
  });
});