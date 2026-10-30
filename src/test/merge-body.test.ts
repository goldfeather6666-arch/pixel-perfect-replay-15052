import { describe, it, expect, vi } from "vitest";
import { mergeBodyFetch } from "@/lib/providers.server";

describe("custom endpoint extra options", () => {
  it("adds reasoning_effort to the chat request body", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await mergeBodyFetch({ reasoning_effort: "low" })!("https://x/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "mercury-3" }) });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({ model: "mercury-3", reasoning_effort: "low" });
    spy.mockRestore();
  });
  it("leaves requests unchanged without options", () => {
    expect(mergeBodyFetch(null)).toBeUndefined();
  });
});
