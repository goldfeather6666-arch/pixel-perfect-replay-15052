import { describe, expect, it, vi } from "vitest";
import { googleQuotaFetch, isGoogleChatModel, parseGoogleQuota } from "@/lib/google-quota";

describe("Gemini free tier", () => {
  it("hides speech and image models from the coding model list", () => {
    expect(isGoogleChatModel("gemini-3.8-flash-tts")).toBe(false);
    expect(isGoogleChatModel("gemini-2.5-flash-image")).toBe(false);
    expect(isGoogleChatModel("gemini-3-flash-preview")).toBe(true);
  });
  it("waits on per-minute limits using Google's retry delay", () => {
    expect(parseGoogleQuota('Quota exceeded per minute "retryDelay": "23s"')).toEqual({ kind: "per_minute", waitMs: 23_500 });
  });
  it("does not wait when the model has no free use", () => {
    expect(parseGoogleQuota("Quota exceeded for metric: free_tier_requests, limit: 0, model: x")).toEqual({ kind: "no_free_access" });
  });
  it("does not wait on daily limits", () => {
    expect(parseGoogleQuota("Quota exceeded, limit: 20, requests per day")).toEqual({ kind: "per_day" });
  });
  it("retries after a per-minute 429 and returns the success", async () => {
    const sleep = vi.fn(async () => {});
    const real = globalThis.fetch;
    let n = 0;
    globalThis.fetch = (async () => (n++ === 0 ? new Response('quota per minute "retryDelay": "2s"', { status: 429 }) : new Response("ok"))) as typeof fetch;
    const res = await googleQuotaFetch(sleep)("https://x");
    globalThis.fetch = real;
    expect(res.status).toBe(200);
    expect(sleep).toHaveBeenCalledWith(2_500);
  });
});
