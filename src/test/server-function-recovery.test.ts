import { afterEach, describe, expect, it, vi } from "vitest";
import { recoveringServerFetch } from "@/lib/server-function-recovery";
vi.mock("@/lib/chunk-recovery", async (original) => ({ ...(await original<typeof import("@/lib/chunk-recovery")>()), recoverChunkLoad: vi.fn() }));
describe("RPC generation recovery", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("detects a stale HTML RPC failure before deserialization without replaying it", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("<!doctype html><title>This page didn't load</title>", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    await expect(recoveringServerFetch("https://forge.test/_serverFn/stale", { method: "POST" })).rejects.toThrow("Invalid server function ID");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("preserves real database and authorization errors without classifying them as stale", async () => {
    const response = new Response("Database permission denied", { status: 500 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await recoveringServerFetch("https://forge.test/_serverFn/current")).toBe(response);
    expect(await response.text()).toBe("Database permission denied");
  });
  it("recognizes a missing function in a JSON 404 without replaying a POST", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Server function info not found for stale-id" }), { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await expect(recoveringServerFetch("https://forge.test/_serverFn/stale", { method: "POST" })).rejects.toThrow("Refresh this page to reconnect");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not treat an ordinary missing resource as an outdated function", async () => {
    const response = new Response("Task not found", { status: 404 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await recoveringServerFetch("https://forge.test/_serverFn/current")).toBe(response);
  });
});