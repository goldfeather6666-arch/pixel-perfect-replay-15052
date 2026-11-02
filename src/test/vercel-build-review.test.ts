import { describe, expect, it } from "vitest";
import { buildLogExcerpt, reviewBuildFindings, vercelBuildFindings } from "@/lib/vercel-build-review";
import { qualityBlocker } from "@/lib/deployment-quality";
describe("successful Vercel build review", () => {
  it("retains early warnings even after hundreds of successful output lines", () => {
    const log = buildLogExcerpt(["Warning: deprecated package old-parser", ...Array.from({ length: 200 }, (_, i) => `Compiled file ${i}`), "Build completed"]);
    expect(vercelBuildFindings(log)).toEqual([{ id: "issue-1", evidence: "Warning: deprecated package old-parser" }]);
  });
  it("does not invent issues for a clean successful build", () => { expect(vercelBuildFindings("Compiled successfully\nBuild completed")).toEqual([]); });
  it("redacts credentials in warning evidence", () => { expect(buildLogExcerpt(["Warning: token=ghp_abcdefghijklmnopqrstuvwxyz"])).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz"); });
  it("requires review of every unique finding", () => { expect(() => reviewBuildFindings([{ id: "issue-1", evidence: "warning" }], [])).toThrow("every finding"); });
  it("requires evidence-backed advisory decisions", () => { expect(() => reviewBuildFindings([{ id: "issue-1", evidence: "warning" }], [{ id: "issue-1", disposition: "advisory", rationale: "ignore" }])).toThrow("Explain"); });
  it("keeps actionable fixes blocking until a fresh deployment is checked", () => { expect(reviewBuildFindings([{ id: "issue-1", evidence: "warning" }], [{ id: "issue-1", disposition: "fix", rationale: "Dependency uses an unsupported runtime API" }])).toContain("Fix source/configuration"); });
  it("permits documented non-actionable provider advisories", () => { expect(reviewBuildFindings([{ id: "issue-1", evidence: "warning" }], [{ id: "issue-1", disposition: "advisory", rationale: "Provider notice has no applicable source change" }])).toBeNull(); });
  it("blocks unreviewed successful builds even when no code changed yet", () => { expect(qualityBlocker({ changed: false, localPassed: true, linked: true, supervised: false, deploymentState: "READY", buildReviewIssue: "Review issue-1" })).toBe("Review issue-1"); });
});