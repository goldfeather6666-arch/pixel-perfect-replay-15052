import { describe, expect, it } from "vitest";
import { classifyRun, postRunReport, reworkRatio, summarizeRuns, type RunEvidence } from "./failure-intelligence";

const base = (over: Partial<RunEvidence> = {}): RunEvidence => ({
  stage: "COMPLETED",
  outcomeState: "VERIFIED_COMPLETE",
  errorCategories: [],
  gate: { passed: true, failureKind: null, failedStep: null },
  budgetOk: true,
  policyOk: true,
  checksAttempted: true,
  checksPassed: true,
  ambiguousWrites: 0,
  failedTools: 0,
  toolFlipFlop: false,
  repairRounds: 0,
  autoContinues: 0,
  compacted: 0,
  droppedForBudget: 0,
  resumed: false,
  modelFallbacks: 0,
  questionsAsked: 0,
  interjections: 0,
  pendingApprovals: 0,
  writes: 2,
  distinctPaths: 2,
  durationMs: 60_000,
  steps: 6,
  blockedOnAccess: false,
  priorContext: { repoMemory: true, typedMemories: 3, projectDoc: false, history: 4 },
  ...over,
});

describe("rework ratio", () => {
  it("counts writes that re-touched an already-touched path", () => {
    expect(reworkRatio({ writes: 4, distinctPaths: 2 })).toBe(0.5);
  });
  it("is zero for a run that wrote nothing", () => {
    expect(reworkRatio({ writes: 0, distinctPaths: 0 })).toBe(0);
  });
});

describe("failure taxonomy", () => {
  it("labels a refused access as auth-blocked", () => {
    expect(classifyRun(base({ errorCategories: ["authorization"] })).mode).toBe("auth-blocked");
    expect(classifyRun(base({ blockedOnAccess: true, gate: null, checksAttempted: false, checksPassed: false })).mode).toBe("auth-blocked");
  });
  it("labels a check that could not run as config", () => {
    expect(classifyRun(base({ gate: { passed: false, failureKind: "config", failedStep: "build" } })).mode).toBe("config");
  });
  it("labels failing project checks as regression", () => {
    const r = classifyRun(base({ gate: { passed: false, failureKind: "regression", failedStep: "test" }, checksPassed: false, outcomeState: "PARTIALLY_COMPLETED" }));
    expect(r.mode).toBe("regression");
    expect(r.evidence.join(" ")).toContain("test");
  });
  it("labels dropped context plus repeated files as context-loss", () => {
    expect(classifyRun(base({ droppedForBudget: 6, compacted: 2, writes: 6, distinctPaths: 2 })).mode).toBe("context-loss");
  });
  it("labels an unconfirmed action as non-determinism", () => {
    expect(classifyRun(base({ ambiguousWrites: 1 })).mode).toBe("non-determinism");
    expect(classifyRun(base({ toolFlipFlop: true })).mode).toBe("non-determinism");
  });
  it("labels transient provider conditions as flaky", () => {
    expect(classifyRun(base({ errorCategories: ["rate_limit"] })).mode).toBe("flaky");
    expect(classifyRun(base({ modelFallbacks: 1 })).mode).toBe("flaky");
  });
  it("gives a clean run no failure mode", () => {
    expect(classifyRun(base()).mode).toBeNull();
  });
});

describe("post-run report", () => {
  it("adds up every human intervention", () => {
    const r = postRunReport(base({ questionsAsked: 2, pendingApprovals: 1, interjections: 3, resumed: true }));
    expect(r.humanInterventions).toBe(7);
    expect(r.interventions).toEqual({ questions: 2, approvals: 1, interjections: 3, resumes: 1 });
  });
  it("never calls a run verified with an unconfirmed action", () => {
    expect(postRunReport(base({ ambiguousWrites: 1 })).verified).toBe(false);
    expect(postRunReport(base()).verified).toBe(true);
  });
  it("records that prior context was available", () => {
    expect(postRunReport(base({ priorContext: { repoMemory: false, typedMemories: 0, projectDoc: false, history: 0 } })).priorContextUsed).toBe(false);
  });
});

describe("cross-project aggregation", () => {
  const row = (repo: string, mode: RunEvidence["errorCategories"], over: Partial<RunEvidence> = {}) => ({
    repo,
    report: postRunReport(base({ errorCategories: mode, ...over })),
  });

  it("ranks top failure modes with honest shares", () => {
    const s = summarizeRuns([
      row("a/repo", ["authorization"]),
      row("a/repo", ["rate_limit"]),
      row("b/repo", ["rate_limit"]),
      row("c/repo", []),
    ]);
    expect(s.runs).toBe(4);
    expect(s.modes[0]).toEqual({ mode: "flaky", runs: 2, share: 0.5 });
    expect(s.topMode).toBe("flaky");
    expect(s.failedRuns).toBe(3);
  });

  it("groups failure modes per project", () => {
    const s = summarizeRuns([row("a/repo", ["authorization"]), row("b/repo", ["rate_limit"]), row("b/repo", ["rate_limit"])]);
    expect(s.perProject[0]).toEqual({ repo: "b/repo", runs: 2, failures: 2, topMode: "flaky" });
  });

  it("reports the prior-context rate and rework average", () => {
    const s = summarizeRuns([
      { repo: "a/repo", report: postRunReport(base({ writes: 4, distinctPaths: 2, priorContext: { repoMemory: true, typedMemories: 0, projectDoc: false, history: 0 } })) },
      { repo: "a/repo", report: postRunReport(base({ writes: 2, distinctPaths: 2, priorContext: { repoMemory: false, typedMemories: 0, projectDoc: false, history: 0 } })) },
    ]);
    expect(s.avgReworkRatio).toBe(0.25);
    expect(s.priorContextShare).toBe(0.5);
    expect(s.interventionsPerRun).toBe(0);
  });

  it("returns empty statistics when nothing was recorded", () => {
    const s = summarizeRuns([]);
    expect(s).toMatchObject({ runs: 0, failedRuns: 0, topMode: null, avgReworkRatio: null, priorContextShare: null });
  });
});
