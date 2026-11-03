import { describe, expect, it } from "vitest";
import { buildSnapshot, hashToken, reviewBadges, shareActive, validWebhook } from "./sharing";

describe("sharing", () => {
  it("expired or revoked shares are inactive", () => {
    const now = Date.parse("2026-01-02");
    expect(shareActive({ expires_at: "2026-01-03", revoked_at: null }, now)).toBe(true);
    expect(shareActive({ expires_at: "2026-01-01", revoked_at: null }, now)).toBe(false);
    expect(shareActive({ expires_at: "2026-01-03", revoked_at: "2026-01-02" }, now)).toBe(false);
  });
  it("hashes tokens deterministically", async () => {
    expect(await hashToken("a")).toBe(await hashToken("a"));
    expect(await hashToken("a")).not.toBe(await hashToken("b"));
  });
  it("snapshot keeps only prompts and final reply", () => {
    const s = buildSnapshot("T", [{ role: "user", content: "build it" }, { role: "tool", content: "SECRET" }, { role: "assistant", content: [{ text: "done" }] }], null);
    expect(s).toEqual({ title: "T", repo: null, prompts: ["build it"], reply: "done" });
  });
  it("badges reflect latest review and checks", () => {
    expect(reviewBadges("approved", [{ status: "passed" }])).toEqual(["reviewed", "checks_passed"]);
    expect(reviewBadges(null, [])).toEqual(["unreviewed"]);
  });
  it("accepts only Slack/Teams webhooks", () => {
    expect(validWebhook("https://hooks.slack.com/services/x")).toBe(true);
    expect(validWebhook("https://evil.com/hook")).toBe(false);
    expect(validWebhook("http://hooks.slack.com/x")).toBe(false);
  });
});
