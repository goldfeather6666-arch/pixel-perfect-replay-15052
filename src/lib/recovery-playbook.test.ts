import { describe, expect, it } from "vitest";
import { recoveryBrief, recoveryFacts, type RecoveryEvent, type RecoveryState } from "./recovery-playbook";

const state = (over: Partial<RecoveryState> = {}): RecoveryState => ({
  objective: "Add customer sign-in",
  stage: "EXECUTING",
  startedAt: "2026-02-11T10:00:00Z",
  pendingChanges: 0,
  pendingApprovals: 0,
  openQuestions: 0,
  lastError: null,
  failingCheck: null,
  failingKind: null,
  ...over,
});

const ev = (type: string, payload: unknown): RecoveryEvent => ({ type, payload });

describe("recovery facts", () => {
  it("counts a successful tool as provably done", () => {
    const f = recoveryFacts(state(), [ev("tool.execution.completed", { tool: "write_file", ok: true })]);
    expect(f.provablyDone.join(" ")).toContain("write_file ran successfully 1×");
  });

  it("keeps a failed tool out of the done list", () => {
    const f = recoveryFacts(state(), [ev("tool.execution.completed", { tool: "run_command", ok: false })]);
    expect(f.provablyDone.join(" ")).not.toContain("run_command");
    expect(f.unverified.join(" ")).toContain("failed 1×");
  });

  it("treats an action with an unknown effect as externally uncertain", () => {
    const f = recoveryFacts(state(), [ev("tool.ambiguous", { tool: "deploy_status" })]);
    expect(f.externalUncertain.join(" ")).toContain("deploy_status");
    expect(f.externalUncertain.join(" ")).toContain("outcome unknown");
  });

  it("lists staged changes and open questions as unverified", () => {
    const f = recoveryFacts(state({ pendingChanges: 3, openQuestions: 1 }), []);
    expect(f.unverified.join(" ")).toContain("3 file change(s)");
    expect(f.unverified.join(" ")).toContain("1 question(s)");
  });

  it("names the failing check that must be reproduced first", () => {
    const f = recoveryFacts(state({ failingCheck: "test", failingKind: "regression" }), []);
    expect(f.reproduceFirst).toContain("test");
    expect(f.reproduceFirst).toContain("regression");
  });

  it("falls back to the recorded error when no check failed", () => {
    const f = recoveryFacts(state({ lastError: "ECONNREFUSED 5432" }), []);
    expect(f.reproduceFirst).toContain("ECONNREFUSED 5432");
  });
});

describe("recovery brief", () => {
  it("separates finished work from work still to do", () => {
    const brief = recoveryBrief(state(), [
      ev("tool.execution.completed", { tool: "write_file", ok: true }),
      ev("tool.execution.completed", { tool: "read_file", ok: true }),
      ev("qa.gate", { passed: true }),
    ]);
    expect(brief).toContain("PROVABLY DONE");
    expect(brief).toContain("write_file ran successfully 1×");
    expect(brief).toContain("project checks passed");
    expect(brief).toContain("What remains");
  });

  it("says so plainly when nothing is provably done", () => {
    expect(recoveryBrief(state(), [])).toContain("nothing yet");
  });

  it("forbids repeating an action whose outcome is unknown", () => {
    const brief = recoveryBrief(state(), [ev("tool.ambiguous", { tool: "apply_migrations" })]);
    expect(brief).toContain("never repeat one");
    expect(brief).toContain("apply_migrations");
  });
});
