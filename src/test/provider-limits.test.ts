import { describe, expect, it, vi } from "vitest";
import { classifyPlanLimit, planLimitFetch } from "@/lib/provider-limits";

describe("free-plan provider limits", () => {
  it("recognises ZRO concurrency and daily refusals", () => {
    expect(classifyPlanLimit("The Free plan runs a limited number of requests at once. Wait for one to finish")).toBe("concurrency");
    expect(classifyPlanLimit("You've used today's Free usage. It resets in 8h 25m.")).toBe("daily");
  });
  it("retries a concurrency refusal and then succeeds", async () => {
    let n = 0;
    const inner = (async () => (n++ === 0 ? new Response("limited number of requests at once", { status: 429 }) : new Response("ok"))) as typeof fetch;
    const sleep = vi.fn(async () => {});
    const res = await planLimitFetch("k1", inner, sleep)("https://x");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(sleep).toHaveBeenCalledTimes(1);
  });
  it("does not retry a daily refusal", async () => {
    const inner = vi.fn(async () => new Response("today's Free usage", { status: 429 })) as unknown as typeof fetch;
    const res = await planLimitFetch("k2", inner, async () => {})("https://x");
    expect(res.status).toBe(429);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});
