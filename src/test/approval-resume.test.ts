import { describe, expect, it } from "vitest";
import { approvalResumeMessage, resumeForcePlan, shouldResumeAfterApproval } from "@/lib/approval-resume";

describe("approval resume", () => {
  it("waits while any action is still pending", () => {
    expect(shouldResumeAfterApproval(["succeeded", "pending"])).toBe(false);
  });
  it("resumes once every action is resolved and one ran", () => {
    expect(shouldResumeAfterApproval(["succeeded", "succeeded", "rejected"])).toBe(true);
  });
  it("does not resume when everything was rejected", () => {
    expect(shouldResumeAfterApproval(["rejected"])).toBe(false);
  });
  it("summarises outcomes", () => {
    expect(approvalResumeMessage(["succeeded", "failed"])).toContain("1 succeeded, 1 failed");
  });
  it("answers keep chat mode instead of forcing build", () => {
    expect(resumeForcePlan("chat")).toBeUndefined();
    expect(resumeForcePlan("plan")).toBe(true);
    expect(resumeForcePlan("build")).toBe(false);
  });
});
