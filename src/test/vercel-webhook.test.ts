import { describe, expect, it } from "vitest";
import { hmacSha1Hex, timingSafeEqual, VERCEL_HANDLED_TYPES } from "@/lib/vercel-webhook";

describe("vercel webhook signature", () => {
  it("computes HMAC-SHA1 hex matching the Node reference implementation", async () => {
    const { createHmac } = await import("node:crypto");
    const body = JSON.stringify({ type: "deployment.ready", payload: { deployment: { id: "dpl_1" } } });
    const expected = createHmac("sha1", "test-secret").update(body).digest("hex");
    expect(await hmacSha1Hex("test-secret", body)).toBe(expected);
  });

  it("accepts a correctly signed body and rejects tampering", async () => {
    const body = '{"type":"deployment.ready"}';
    const sig = await hmacSha1Hex("s3cret", body);
    expect(timingSafeEqual(sig, await hmacSha1Hex("s3cret", body))).toBe(true);
    expect(timingSafeEqual(sig, await hmacSha1Hex("s3cret", body + " "))).toBe(false);
    expect(timingSafeEqual(sig, await hmacSha1Hex("wrong", body))).toBe(false);
  });

  it("rejects signatures of different length without throwing", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("handles deployment lifecycle events and ignores the rest", () => {
    expect(VERCEL_HANDLED_TYPES.has("deployment.ready")).toBe(true);
    expect(VERCEL_HANDLED_TYPES.has("deployment.error")).toBe(true);
    expect(VERCEL_HANDLED_TYPES.has("deployment.canceled")).toBe(true);
    expect(VERCEL_HANDLED_TYPES.has("project.created")).toBe(false);
  });
});
