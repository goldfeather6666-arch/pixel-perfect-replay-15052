import { describe, expect, it } from "vitest";
import { chunkRecoveryUrl, isChunkLoadError, isRecoverableModuleError } from "@/lib/chunk-recovery";

describe("stale route recovery", () => {
  it("recovers mixed-generation React dispatchers but not ordinary null state errors", () => {
    const error = new TypeError("Cannot read properties of null (reading 'useState')");
    error.stack = "at exports.useState (/node_modules/.vite/deps/react.js?v=old:748:30)\nat VisualComparison";
    expect(isRecoverableModuleError(error)).toBe(true);
    error.stack = "at app (/src/lib/app.ts:4:1)";
    expect(isRecoverableModuleError(error)).toBe(false);
    expect(isRecoverableModuleError(new Error("Invalid hook call"))).toBe(false);
  });
  it("recognizes module failures without retrying unrelated errors", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/route-old.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Database permission denied"))).toBe(false);
  });
  it("recovers tabs holding a module that imports a since-removed export", () => {
    const error = new SyntaxError("The requested module '/src/components/ProjectHealth.tsx' does not provide an export named 'AutoFixButton'");
    expect(isRecoverableModuleError(error)).toBe(true);
    expect(isRecoverableModuleError(new SyntaxError("Unexpected token '<'"))).toBe(false);
  });
  it("reloads pages calling server functions from before a server restart", () => {
    expect(isRecoverableModuleError(new Error("Invalid server function ID: eyJmaWxlIjoi"))).toBe(true);
    expect(isRecoverableModuleError(new Error("Unauthorized"))).toBe(false);
  });
  it("changes the document URL while preserving task, query and hash", () => {
    const url = new URL(chunkRecoveryUrl("https://forge.test/s/task?tab=deploy#saved", 100_000, 0) ?? "https://invalid.test");
    expect(url.pathname).toBe("/s/task");
    expect(url.searchParams.get("tab")).toBe("deploy");
    expect(url.searchParams.get("_forge_refresh")).toBe("100000");
    expect(url.hash).toBe("#saved");
  });
  it("bounds retries even when storage is unavailable", () => {
    expect(chunkRecoveryUrl("https://forge.test/?_forge_refresh=100000", 105_000, 0)).toBeNull();
    expect(chunkRecoveryUrl("https://forge.test/", 105_000, 100_000)).toBeNull();
    expect(chunkRecoveryUrl("https://forge.test/?_forge_refresh=100000", 115_001, 0)).not.toBeNull();
  });
});
import { isStaleServerFunctionError as staleFn, recoverChunkLoad } from "@/lib/chunk-recovery";
import { it as it2, expect as expect2, afterEach as afterEach2 } from "vitest";
it2("treats the restarted server's HTML error page as a stale server function", () => {
  expect2(staleFn(new Error("<!doctype html>\n<html><head><title>This page didn't load</title></head></html>"))).toBe(true);
  expect2(staleFn(new Error("Forbidden"))).toBe(false);
});

it2("comes back for the fresh manifest when the immediate reload is throttled", () => {
  let replaced = "";
  let scheduled: (() => void) | null = null;
  let waited = -1;
  const store: Record<string, string> = { "forge-chunk-reload": String(Date.now()) };
  const fake = {
    location: { href: "https://forge.test/s/task", replace: (u: string) => { replaced = u; } },
    sessionStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
    setTimeout: (fn: () => void, ms: number) => { scheduled = fn; waited = ms; return 1; },
  };
  (globalThis as { window?: unknown }).window = fake;
  afterEach2(() => { delete (globalThis as { window?: unknown }).window; });
  expect2(recoverChunkLoad()).toBe(true);
  expect2(replaced).toBe(""); // throttled: no reload storm
  expect2(waited).toBeGreaterThan(0);
  expect2(waited).toBeLessThanOrEqual(15_250);
  const run = scheduled as (() => void) | null;
  run?.();
  expect2(replaced).toContain("_forge_refresh");
});

import { isTransientServerError as transient, transientRetry } from "@/lib/chunk-recovery";
it2("retries a request the restarting server aborted, but not a refused action", () => {
  expect2(transient(new Error("Error: aborted"))).toBe(true);
  expect2(transient(new Error("The app returned 500 while handling GET /_serverFn/eyJmaWxl"))).toBe(true);
  expect2(transient(new Error("Failed to fetch"))).toBe(true);
  expect2(transient(new Error("Invalid server function ID: eyJmaWxlIjoi"))).toBe(false);
  expect2(transient(new Error("Unauthorized"))).toBe(false);
  expect2(transient(new Error("Database permission denied"))).toBe(false);
});

it2("stops retrying a transient failure after three tries", () => {
  const aborted = new Error("Error: aborted");
  expect2(transientRetry.retry(0, aborted)).toBe(true);
  expect2(transientRetry.retry(2, aborted)).toBe(true);
  expect2(transientRetry.retry(3, aborted)).toBe(false);
  expect2(transientRetry.retry(0, new Error("Unauthorized"))).toBe(false);
  expect2(transientRetry.retryDelay(0)).toBe(400);
  expect2(transientRetry.retryDelay(5)).toBe(2000);
});
