import { describe, expect, it } from "vitest";
import { appendSuggestion, assistanceRequest, canApplyAssistance, parseAssistance, promptSuggestions } from "@/lib/prompt-assistance";

describe("live prompt assistance", () => {
  it("keeps the 300000-character prompt capacity", () => {
    const sessionId = "00000000-0000-4000-8000-000000000000";
    expect(assistanceRequest.safeParse({ sessionId, draft: "a".repeat(300000) }).success).toBe(true);
    expect(assistanceRequest.safeParse({ sessionId, draft: "a".repeat(300001) }).success).toBe(false);
  });
  it("never truncates a draft to add a suggestion", () => {
    const draft = "a".repeat(300000);
    expect(appendSuggestion(draft, "Verify the result")).toBe(draft);
  });
  it("requires unchanged user draft before replacing it", () => {
    expect(canApplyAssistance("my changed draft", "original", "refined")).toBe(false);
    expect(canApplyAssistance("original", "original", "refined")).toBe(true);
  });
  it("only offers relevant missing constraints", () => {
    expect(promptSuggestions("Build a dashboard").map((s) => s.id)).toContain("mobile");
    expect(promptSuggestions("Build a responsive dashboard and verify it").map((s) => s.id)).not.toContain("mobile");
    expect(promptSuggestions("Fix a crash").map((s) => s.id)).toContain("reproduce");
  });
  it("validates model output instead of accepting arbitrary data", () => {
    expect(parseAssistance('{"refined":"Keep the same scope","questions":[]}').refined).toBe("Keep the same scope");
    expect(() => parseAssistance('{"refined":"","questions":[]}')).toThrow();
  });
});