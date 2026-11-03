import { describe, it, expect } from "vitest";
import { authorityTier, resolveConflict, completionState, constitutionPrompt, PRINCIPLES, PROHIBITIONS, INSTRUCTION_HIERARCHY } from "@/lib/engine/constitution";
import { specProblems, stageToCompletion, DEFAULT_BUDGET, type TaskSpec } from "@/lib/engine/task-spec";
import { productionInstructions } from "@/lib/deployment-quality";

const spec = (o: Partial<TaskSpec> = {}): TaskSpec => ({
  taskId: "t", request: "r", objective: "Add login", domain: "coding", intent: "implement",
  inScope: ["auth"], exclusions: [], constraints: [], assumptions: [], inputs: [], deliverables: [],
  acceptanceCriteria: [{ id: "a1", text: "login works", required: true, verification: "e2e test" }],
  verificationProcedure: "run tests", dependencies: [], budget: DEFAULT_BUDGET.small, riskTier: "small",
  pinnedResources: {}, requiredSkills: [], requiredCapabilities: [], planVersion: 1, ...o,
});

describe("UAF constitution", () => {
  it("has 8 tiers, 15 principles, 8 prohibitions", () => {
    expect(INSTRUCTION_HIERARCHY).toHaveLength(8);
    expect(PRINCIPLES).toHaveLength(15);
    expect(PROHIBITIONS).toHaveLength(8);
  });
  it("external content has no authority and loses to any tier", () => {
    expect(authorityTier("external")).toBe(Infinity);
    expect(resolveConflict({ source: "skill" as const }, { source: "external" as const })?.source).toBe("skill");
  });
  it("user authorization outranks project and skill instructions", () => {
    expect(resolveConflict({ source: "skill" as const }, { source: "user" as const })?.source).toBe("user");
    expect(resolveConflict({ source: "user" as const }, { source: "project" as const })?.source).toBe("user");
  });
  it("VERIFIED_COMPLETE requires evidence for every required criterion", () => {
    expect(completionState({ started: true, criteria: [{ id: "a", required: true, status: "passed" }] })).toBe("COMPLETED_UNVERIFIED");
    expect(completionState({ started: true, criteria: [{ id: "a", required: true, status: "passed", evidence: "tests 5/5" }] })).toBe("VERIFIED_COMPLETE");
  });
  it("mixed results are partial, all failed is failed, none is unverified", () => {
    const passed = { id: "a", required: true, status: "passed" as const, evidence: "ok" };
    expect(completionState({ started: true, criteria: [passed, { id: "b", required: true, status: "failed" }] })).toBe("PARTIALLY_COMPLETED");
    expect(completionState({ started: true, criteria: [{ id: "b", required: true, status: "failed" }] })).toBe("FAILED");
    expect(completionState({ started: true, criteria: [] })).toBe("COMPLETED_UNVERIFIED");
    expect(completionState({ started: false, planned: true, criteria: [] })).toBe("PLANNED");
  });
  it("a completed run maps to COMPLETED_UNVERIFIED, never verified", () => {
    expect(stageToCompletion("COMPLETED")).toBe("COMPLETED_UNVERIFIED");
    expect(stageToCompletion("CANCELLED")).toBe("FAILED");
  });
  it("constitution is the first layer of every agent's instructions", () => {
    expect(productionInstructions.startsWith(constitutionPrompt)).toBe(true);
  });
});

describe("Task specification", () => {
  it("accepts a well-formed spec", () => expect(specProblems(spec())).toEqual([]));
  it("rejects specs without required, verifiable criteria", () => {
    expect(specProblems(spec({ acceptanceCriteria: [] }))).toContain("no acceptance criteria");
    expect(specProblems(spec({ acceptanceCriteria: [{ id: "a", text: "x", required: true, verification: "" }] }))).toContain("criterion a has no verification method");
  });
  it("high-risk tasks need a rollback constraint", () => {
    expect(specProblems(spec({ riskTier: "high_risk" }))).toContain("high-risk task needs a rollback constraint");
    expect(specProblems(spec({ riskTier: "high_risk", constraints: ["rollback via revert"] }))).toEqual([]);
  });
  it("scope cannot also be excluded", () => {
    expect(specProblems(spec({ exclusions: ["auth"] }))[0]).toMatch(/also excluded/);
  });
});
