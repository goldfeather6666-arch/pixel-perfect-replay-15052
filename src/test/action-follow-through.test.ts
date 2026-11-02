import { describe, expect, it } from "vitest";
import { actionFollowThrough } from "@/lib/engine/action-follow-through";

const base = { text: "I'll check the deployment and logs now that build protection is removed, and investigate any issues Vercel surfaced.", toolCalls: 0, finishReason: "stop", plan: false, waiting: false, aborted: false, exhausted: false, continued: false };
describe("promised action completion guard", () => {
  it("continues the screenshot's promise-only reply once", () => { expect(actionFollowThrough(base)).toBe("continue"); });
  it("blocks instead of looping if a follow-up still only promises work", () => { expect(actionFollowThrough({ ...base, continued: true })).toBe("blocked"); });
  it("accepts an actual tool invocation", () => { expect(actionFollowThrough({ ...base, continued: true, toolCalls: 1 })).toBeNull(); });
  it.each(["plan", "waiting", "aborted", "exhausted"] as const)("does not continue when %s", (flag) => { expect(actionFollowThrough({ ...base, [flag]: true })).toBeNull(); });
  it.each(["content-filter", "error", "length", "unknown"])("does not replay a %s finish", (finishReason) => { expect(actionFollowThrough({ ...base, finishReason })).toBeNull(); });
  it("does not replay a refusal hidden behind stop", () => { expect(actionFollowThrough({ ...base, rawFinishReason: "refusal" })).toBeNull(); });
  it.each(["I'll check it, but I cannot access that project.", "I'll run it after your approval.", "I'll check it. Access denied.", "I refuse to do that.", ""])("preserves terminal or empty replies", (text) => { expect(actionFollowThrough({ ...base, text })).toBeNull(); });
  it("does not force tools for conversational answers", () => { expect(actionFollowThrough({ ...base, text: "The deployment succeeded. Here are the results." })).toBeNull(); });
});