import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { ERROR_BRIDGE } from "@/lib/preview-gateway";

describe("preview failed-request capture", () => {
  it("captures HTTP failures without query, fragment, headers or bodies", async () => {
    const messages: unknown[] = [];
    const response = { status: 403 };
    const browser: Record<string, any> = {
      URL, location: { href: "https://preview.example/account", pathname: "/account" },
      parent: { postMessage: (m: unknown) => messages.push(m) },
      addEventListener: () => {}, console: { error: () => {} }, fetch: async () => response,
    };
    browser["window"] = browser;
    runInNewContext(ERROR_BRIDGE.replace(/^<script>|<\/script>$/g, ""), browser);
    const result = await browser["fetch"]("https://user:password@example.com/api/items?private=secret#token", { headers: { Authorization: "Bearer secret" }, body: "private body" });
    expect(result).toBe(response);
    expect(JSON.parse(JSON.stringify(messages))).toEqual([{ forgePreviewError: "HTTP 403 · /api/items", path: "/account" }]);
  });
  it("preserves rejection behavior and reports handled network failures", async () => {
    const messages: unknown[] = [];
    const failure = new Error("private provider detail");
    const browser: Record<string, any> = { URL, location: { href: "https://preview.example/", pathname: "/" }, parent: { postMessage: (m: unknown) => messages.push(m) }, addEventListener: () => {}, console: { error: () => {} }, fetch: async () => { throw failure; } };
    browser["window"] = browser;
    runInNewContext(ERROR_BRIDGE.replace(/^<script>|<\/script>$/g, ""), browser);
    await expect(browser["fetch"]("/api/data?key=secret")).rejects.toBe(failure);
    expect(JSON.parse(JSON.stringify(messages))).toEqual([{ forgePreviewError: "Network request failed · /api/data", path: "/" }]);
  });
});