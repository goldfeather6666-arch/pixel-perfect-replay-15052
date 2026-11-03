import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkRecoveryUrl, documentIsLoading, recoverChunkLoad } from "@/lib/chunk-recovery";

type Fake = {
  replaced: string[];
  loadHandlers: Array<() => void>;
  store: Record<string, string>;
};

function fakeWindow(now: number, seed: Record<string, string>, opts: { loading?: boolean } = {}): Fake {
  const fake: Fake = { replaced: [], loadHandlers: [], store: { ...seed } };
  const win = {
    location: { href: "https://forge.test/s/task", replace: (u: string) => { fake.replaced.push(u); } },
    sessionStorage: {
      getItem: (k: string) => fake.store[k] ?? null,
      setItem: (k: string, v: string) => { fake.store[k] = v; },
      removeItem: (k: string) => { delete fake.store[k]; },
    },
    setTimeout: (_fn: () => void, _ms: number) => 1,
    addEventListener: (_type: string, fn: () => void) => { fake.loadHandlers.push(fn); },
  };
  vi.stubGlobal("window", win);
  if (opts.loading) vi.stubGlobal("document", { readyState: "loading" });
  else vi.stubGlobal("document", { readyState: "complete" });
  void now;
  return fake;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("recovery reload budget", () => {
  it("refuses a fourth reload while the server keeps changing under the tab", () => {
    const now = Date.now();
    const fake = fakeWindow(now, {
      "forge-chunk-reload": String(now - 60_000),
      "forge-chunk-reload-tries": "3",
      "forge-chunk-reload-window": String(now - 10_000),
    });
    expect(recoverChunkLoad()).toBe(false);
    expect(fake.replaced).toEqual([]);
  });

  it("refills the budget once the window has passed", () => {
    const now = Date.now();
    const fake = fakeWindow(now, {
      "forge-chunk-reload": String(now - 60_000),
      "forge-chunk-reload-tries": "3",
      "forge-chunk-reload-window": String(now - 95_000),
    });
    expect(recoverChunkLoad()).toBe(true);
    expect(fake.replaced).toHaveLength(1);
    expect(fake.replaced[0]).toContain("_forge_refresh");
    expect(fake.store["forge-chunk-reload-tries"]).toBe("1");
  });

  it("never aborts a document that is still arriving", () => {
    const fake = fakeWindow(Date.now(), {}, { loading: true });
    expect(documentIsLoading()).toBe(true);
    expect(recoverChunkLoad()).toBe(true);
    expect(fake.replaced).toEqual([]); // no replace while the page is loading
    expect(fake.loadHandlers).toHaveLength(1);
    fake.loadHandlers[0]();
    expect(fake.replaced).toHaveLength(1);
    expect(fake.replaced[0]).toContain("_forge_refresh");
    fake.loadHandlers[0](); // the settle timer firing later must not reload twice
    expect(fake.replaced).toHaveLength(1);
  });

  it("pure helper refuses past the budget but allows a fresh one", () => {
    const now = 200_000;
    expect(chunkRecoveryUrl("https://forge.test/s/x", now, 0, 3, now - 5_000)).toBeNull();
    expect(chunkRecoveryUrl("https://forge.test/s/x", now, 0, 2, now - 5_000)).toContain("_forge_refresh");
    expect(chunkRecoveryUrl("https://forge.test/s/x", now, 0, 3, now - 95_000)).toContain("_forge_refresh");
  });
});
