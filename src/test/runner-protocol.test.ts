import { describe, expect, it } from "vitest";
import { parsePairingCode, parseRunnerBoxId, providerOf, runnerBoxId, runnerKeyId, runnerUsable, signRequest, verifyRequest } from "@/lib/runner-protocol";

const secret = "s".repeat(48);

describe("runner protocol", () => {
  it("accepts a correctly signed request and rejects tampering", async () => {
    const { ts, signature } = await signRequest(secret, "POST", "/v1/health", "{}");
    expect(await verifyRequest(secret, "POST", "/v1/health", "{}", ts, signature)).toBe(true);
    expect(await verifyRequest(secret, "POST", "/v1/health", '{"x":1}', ts, signature)).toBe(false);
    expect(await verifyRequest("t".repeat(48), "POST", "/v1/health", "{}", ts, signature)).toBe(false);
  });
  it("rejects signatures older than five minutes", async () => {
    const old = Date.now() - 6 * 60_000;
    const { ts, signature } = await signRequest(secret, "POST", "/p", "", old);
    expect(await verifyRequest(secret, "POST", "/p", "", ts, signature)).toBe(false);
  });
  it("parses pairing codes and requires https", () => {
    const code = btoa(JSON.stringify({ url: "https://abc.trycloudflare.com/", secret })).replace(/=+$/, "");
    expect(parsePairingCode(code)).toEqual({ url: "https://abc.trycloudflare.com", secret });
    expect(() => parsePairingCode(btoa(JSON.stringify({ url: "http://x.com", secret })))).toThrow();
  });
  it("routes workspace ids to the right provider", async () => {
    const id = runnerBoxId(await runnerKeyId(secret), "abcdef12");
    expect(providerOf(id)).toBe("oracle");
    expect(parseRunnerBoxId(id)?.box).toBe("abcdef12");
    expect(providerOf("i8k2nd9e0")).toBe("e2b");
  });
  it("falls back when the server is stale, offline or full", () => {
    const now = Date.now();
    expect(runnerUsable({ status: "online", last_seen: new Date(now - 30_000).toISOString() }, now)).toBe(true);
    expect(runnerUsable({ status: "online", last_seen: new Date(now - 3 * 60_000).toISOString() }, now)).toBe(false);
    expect(runnerUsable({ status: "degraded", last_seen: new Date(now).toISOString() }, now)).toBe(false);
    expect(runnerUsable({ status: "online", last_seen: new Date(now).toISOString(), capacity: { free_slots: 0 } }, now)).toBe(false);
  });
});
