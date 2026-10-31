import { describe, expect, it } from "vitest";
import { canTransition, finalStage, isTerminal, stageProgress } from "@/lib/engine/lifecycle";
import { classifyError, redact } from "@/lib/engine/errors";
import { costUsd, fitToBudget, modelCaps } from "@/lib/engine/model-registry";
import { parseSkill, selectSkills } from "@/lib/engine/skill-meta";
import { asAutonomy, deployAllowed, migrationNeedsApproval, writeNeedsApproval } from "@/lib/engine/autonomy";
import { scheduleWaves, teamSchema } from "@/lib/agent-team";

const base = { aborted: false, errored: false, blocker: null, exhausted: false, plan: false, pendingChanges: 0, stagedActions: 0 };

describe("run lifecycle", () => {
  it("rejects skipping straight from received to completed", () => {
    expect(canTransition("RECEIVED", "COMPLETED")).toBe(false);
    expect(canTransition("VERIFYING", "REPAIRING")).toBe(true);
    expect(isTerminal("COMPLETED")).toBe(true);
  });
  it("never reports completed when blocked, out of steps, stopped or waiting for approval", () => {
    expect(finalStage({ ...base, blocker: "build failed" }).stage).toBe("BLOCKED");
    expect(finalStage({ ...base, exhausted: true }).stage).toBe("BLOCKED");
    expect(finalStage({ ...base, aborted: true }).stage).toBe("CANCELLED");
    expect(finalStage({ ...base, pendingChanges: 2 }).stage).toBe("AWAITING_APPROVAL");
    expect(finalStage({ ...base, stagedActions: 1 }).stage).toBe("AWAITING_APPROVAL");
    expect(finalStage(base).stage).toBe("COMPLETED");
  });
  it("progress comes from stages reached, 100 only when completed", () => {
    expect(stageProgress(["RECEIVED", "DISCOVERING", "EXECUTING"])).toBe(55);
    expect(stageProgress(["RECEIVED", "DISCOVERING", "EXECUTING", "BLOCKED"])).toBe(55);
    expect(stageProgress(["RECEIVED", "EXECUTING", "COMPLETED"])).toBe(100);
  });
});

describe("error taxonomy", () => {
  it("classifies and marks retryability", () => {
    expect(classifyError("429 Too Many Requests")).toEqual({ category: "rate_limit", retryable: true });
    expect(classifyError("401 Unauthorized: invalid api key").category).toBe("authentication");
    expect(classifyError("JavaScript heap out of memory").category).toBe("resource");
  });
  it("redacts secrets before storing", () => {
    const out = redact("failed with sk-abcdefghijklmnop and token=supersecretvalue https://u:p@host.com");
    expect(out).not.toContain("abcdefghijklmnop");
    expect(out).not.toContain("supersecretvalue");
    expect(out).not.toContain("u:p@");
  });
});

describe("model registry", () => {
  it("knows common models and flags unknown ones", () => {
    expect(modelCaps("anthropic/claude-sonnet-4.5").contextWindow).toBe(200_000);
    expect(modelCaps("deepseek-chat").vision).toBe(false);
    expect(modelCaps("totally-new-model").known).toBe(false);
  });
  it("prices only when pricing is known", () => {
    expect(costUsd(modelCaps("gpt-4o"), { input: 1_000_000, output: 1_000_000 })).toBe(12.5);
    expect(costUsd(modelCaps("mercury-3"), { input: 1000, output: 1000 })).toBeNull();
  });
  it("trims oldest history to fit the context window but keeps the newest", () => {
    const caps = { ...modelCaps("unknown"), contextWindow: 20_000, maxOutput: 4_000 };
    const r = fitToBudget([1, 2, 3, 4, 5], () => 5_000, caps, 2_000);
    expect(r.kept).toEqual([4, 5]);
    expect(r.dropped).toBe(3);
  });
});

describe("skills engine", () => {
  const ui = parseSkill("ui", "---\nname: ui-kit\ndescription: Build accessible React UI\ntriggers: [landing page, button]\ndepends: [tokens]\nversion: 2\n---\nUse the kit.");
  const tokens = parseSkill("tokens", "---\nactivation: manual\n---\nDesign tokens.");
  const always = parseSkill("house", "---\nactivation: always\n---\nHouse rules.");
  it("parses front matter", () => {
    expect(ui.name).toBe("ui-kit");
    expect(ui.triggers).toEqual(["landing page", "button"]);
    expect(ui.version).toBe("2");
    expect(ui.body.trim()).toBe("Use the kit.");
  });
  it("selects by trigger, pulls dependencies, always-on, and reports missing deps", () => {
    const r = selectSkills("Build a landing page", [ui, tokens, always]);
    const names = r.selected.map((s) => s.skill.name).sort();
    expect(names).toEqual(["house", "tokens", "ui-kit"]);
    expect(r.selected.find((s) => s.skill.name === "tokens")!.reason).toBe("required by ui-kit");
    const lonely = parseSkill("a", "---\ntriggers: deploy\ndepends: ghost\n---\nx");
    expect(selectSkills("deploy it", [lonely]).missingDeps).toEqual(["ghost"]);
  });
  it("does not load unrelated skills", () => {
    expect(selectSkills("fix the database index", [ui, tokens]).selected).toEqual([]);
  });
});

describe("autonomy levels", () => {
  it("level 1 stages every write; levels 3-4 commit", () => {
    expect(writeNeedsApproval("supervised", { path: "a.ts", action: "write" })).toBe(true);
    expect(writeNeedsApproval("autonomous", { path: "package.json", action: "write" })).toBe(false);
  });
  it("level 2 stages deletes, config/migration files and big rewrites only", () => {
    expect(writeNeedsApproval("significant", { path: "src/a.ts", action: "write", content: "x\ny", original: "x" })).toBe(false);
    expect(writeNeedsApproval("significant", { path: "src/a.ts", action: "delete" })).toBe(true);
    expect(writeNeedsApproval("significant", { path: "package.json", action: "write" })).toBe(true);
    expect(writeNeedsApproval("significant", { path: "supabase/migrations/1_x.sql", action: "write" })).toBe(true);
    const big = Array(100).fill("l").join("\n");
    expect(writeNeedsApproval("significant", { path: "src/a.ts", action: "write", content: "short", original: big })).toBe(true);
  });
  it("level 3 waits only for destructive SQL; level 4 never", () => {
    expect(migrationNeedsApproval("autonomous", "create table x (id int);")).toBe(false);
    expect(migrationNeedsApproval("autonomous", "drop table users;")).toBe(true);
    expect(migrationNeedsApproval("autonomous", "delete from users;")).toBe(true);
    expect(migrationNeedsApproval("autonomous", "delete from users where id = 1;")).toBe(false);
    expect(migrationNeedsApproval("full", "drop table users;")).toBe(false);
    expect(migrationNeedsApproval("significant", "create table x (id int);")).toBe(true);
  });
  it("deploy actions only at levels 3-4; unknown modes fall back to level 1", () => {
    expect(deployAllowed("significant")).toBe(false);
    expect(deployAllowed("autonomous")).toBe(true);
    expect(asAutonomy("weird")).toBe("supervised");
  });
});

describe("specialist scheduling", () => {
  it("accepts specialist roles", () => {
    expect(teamSchema.safeParse({ jobs: [{ label: "db", role: "database", task: "add table", paths: ["a.sql"] }] }).success).toBe(true);
  });
  it("orders dependent jobs into waves and rejects cycles/unknown labels", () => {
    expect(scheduleWaves([{ label: "design" }, { label: "api", after: ["design"] }, { label: "ui", after: ["design"] }, { label: "qa", after: ["api", "ui"] }])).toEqual([[0], [1, 2], [3]]);
    expect(scheduleWaves([{ label: "a", after: ["b"] }, { label: "b", after: ["a"] }])).toBe("Job dependencies form a cycle.");
    expect(typeof scheduleWaves([{ label: "a", after: ["zzz"] }])).toBe("string");
  });
});
