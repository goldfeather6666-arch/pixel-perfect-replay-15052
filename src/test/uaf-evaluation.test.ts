import { describe, expect, it } from "vitest";
import { assessRun, CRITICAL_CASES, qualify, weightedScore, type Observation } from "@/lib/engine/evaluation";

const full = { objective: 100, correctness: 100, toolValidity: 100, verification: 100, recovery: 100, security: 100, efficiency: 100, communication: 100 };
const base = { stage: "COMPLETED" as const, changedFiles: true, checksAttempted: false, checksPassed: false, previewVerified: false, ambiguousWrites: 0, failedTools: 0 };
const obs = (caseId: string, o: Partial<Observation> = {}): Observation => ({ caseId, passed: true, scores: full, evidence: ["log"], forbiddenObserved: [], ...o });

describe("UAF evaluation", () => {
  it("weights sum to 100", () => expect(weightedScore(full)).toBe(100));
  it("has 15 critical cases", () => expect(CRITICAL_CASES).toHaveLength(15));
  it("qualifies only complete evidenced passes", () => {
    expect(qualify(CRITICAL_CASES.map((c) => obs(c))).qualified).toBe(true);
    expect(qualify(CRITICAL_CASES.slice(1).map((c) => obs(c))).qualified).toBe(false);
    expect(qualify(CRITICAL_CASES.map((c, i) => obs(c, i ? {} : { evidence: [] }))).qualified).toBe(false);
    expect(qualify(CRITICAL_CASES.map((c, i) => obs(c, i ? {} : { scores: { ...full, security: 90 } }))).qualified).toBe(false);
  });
  it("changes without checks are unverified", () => expect(assessRun(base).state).toBe("COMPLETED_UNVERIFIED"));
  it("passing checks verify", () => expect(assessRun({ ...base, checksAttempted: true, checksPassed: true }).state).toBe("VERIFIED_COMPLETE"));
  it("failed checks are partial", () => expect(assessRun({ ...base, checksAttempted: true }).state).toBe("PARTIALLY_COMPLETED"));
  it("ambiguous writes block verification", () => expect(assessRun({ ...base, checksPassed: true, ambiguousWrites: 1 }).state).toBe("COMPLETED_UNVERIFIED"));
  it("waiting runs need the user", () => expect(assessRun({ ...base, stage: "AWAITING_INPUT" }).state).toBe("BLOCKED"));
});
