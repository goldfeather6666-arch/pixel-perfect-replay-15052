import { describe, expect, it } from "vitest";
import { agentRequest, promptCapacity, promptError, requestError } from "@/lib/agent-request";

const sessionId = "12345678-1234-4123-8123-123456789012";
describe("large agent prompts", () => {
  it("accepts prompts beyond the old 20,000 character limit intact", () => {
    const message = "a".repeat(50_000);
    expect(agentRequest.parse({ sessionId, message }).message).toBe(message);
  });
  it("accepts exactly 300,000 characters", () => {
    expect(agentRequest.safeParse({ sessionId, message: "a".repeat(300_000) }).success).toBe(true);
  });
  it("rejects oversized prompts with an actionable size error", () => {
    const message = "a".repeat(300_001);
    const result = agentRequest.safeParse({ sessionId, message });
    expect(result.success).toBe(false);
    if (!result.success) expect(requestError(result.error.issues, message)).toContain("300,001 characters");
    expect(promptError(message)).toContain("300,000 per message");
  });
  it("reports remaining capacity and warns in the final ten percent", () => {
    expect(promptCapacity("a".repeat(269_999))).toEqual({ used: 269_999, remaining: 30_001, nearLimit: false, overLimit: false });
    expect(promptCapacity("a".repeat(270_000))).toEqual({ used: 270_000, remaining: 30_000, nearLimit: true, overLimit: false });
    expect(promptCapacity("a".repeat(300_001))).toEqual({ used: 300_001, remaining: -1, nearLimit: false, overLimit: true });
  });
  it("rejects empty prompts before starting work", () => { expect(promptError("  ")).toBe("Enter a message before sending."); });
});