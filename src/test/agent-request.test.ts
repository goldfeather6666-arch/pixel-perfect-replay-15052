import { describe, expect, it } from "vitest";
import { agentRequest, promptError, requestError } from "@/lib/agent-request";

const sessionId = "12345678-1234-4123-8123-123456789012";
describe("large agent prompts", () => {
  it("accepts prompts beyond the old 20,000 character limit intact", () => {
    const message = "a".repeat(50_000);
    expect(agentRequest.parse({ sessionId, message }).message).toBe(message);
  });
  it("accepts exactly 200,000 characters", () => {
    expect(agentRequest.safeParse({ sessionId, message: "a".repeat(200_000) }).success).toBe(true);
  });
  it("rejects oversized prompts with an actionable size error", () => {
    const message = "a".repeat(200_001);
    const result = agentRequest.safeParse({ sessionId, message });
    expect(result.success).toBe(false);
    if (!result.success) expect(requestError(result.error.issues, message)).toContain("200,001 characters");
    expect(promptError(message)).toContain("200,000 per message");
  });
  it("rejects empty prompts before starting work", () => { expect(promptError("  ")).toBe("Enter a message before sending."); });
});