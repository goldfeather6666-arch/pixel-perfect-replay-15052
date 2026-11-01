import { describe, expect, it } from "vitest";
import { cachedTree, getCachedTree, putCachedTree } from "@/lib/tree-cache";
import { parseWorkerReport } from "@/lib/engine/worker-report";
import { parseSkill, selectSkills } from "@/lib/engine/skill-meta";
import { skillStats, successRate } from "@/lib/engine/skill-stats";

describe("commit-aware tree cache", () => {
  it("reuses the tree only while the head commit is unchanged", async () => {
    let loads = 0;
    const load = async () => { loads++; return ["a.ts"]; };
    expect((await cachedTree("k1", async () => "sha1", load)).hit).toBe(false);
    expect((await cachedTree("k1", async () => "sha1", load)).hit).toBe(true);
    expect((await cachedTree("k1", async () => "sha2", load)).hit).toBe(false);
    expect(loads).toBe(2);
  });
  it("expires after 30 minutes", () => {
    putCachedTree("k2", "s", ["x"], 0);
    expect(getCachedTree("k2", "s", 31 * 60_000)).toBeNull();
  });
});

describe("worker report contract", () => {
  const body = (files: string[]) => "done\n```report\n" + JSON.stringify({ objective: "o", proposed_files: files, tests: [{ command: "npm test", outcome: "pass" }] }) + "\n```";
  it("flags a missing report", () => {
    expect(parseWorkerReport("just text", [], []).issues[0]).toMatch(/structured report/);
  });
  it("flags files outside ownership", () => {
    const r = parseWorkerReport(body(["src/b.ts"]), ["src/a.ts"], ["src/b.ts"]);
    expect(r.report?.tests[0]?.command).toBe("npm test");
    expect(r.issues.join(" ")).toMatch(/outside its ownership/);
  });
  it("accepts a clean owned report", () => {
    expect(parseWorkerReport(body(["src/a.ts"]), ["src/a.ts"], ["src/a.ts"]).issues).toEqual([]);
  });
});

describe("skill effectiveness", () => {
  const skill = parseSkill("chart-helper", "---\ndescription: build charts dashboards\n---\nUse recharts.");
  it("needs four samples before scoring", () => {
    expect(successRate({ loaded: 3, completed: 3 })).toBeNull();
  });
  it("skips a weakly matched skill that usually fails", () => {
    const stats = skillStats(Array.from({ length: 8 }, () => ({ skill_name: "chart-helper", outcome: "failed" })));
    expect(selectSkills("add charts to dashboards", [skill]).selected).toHaveLength(1);
    expect(selectSkills("add charts to dashboards", [skill], stats).selected).toHaveLength(0);
  });
  it("loads a single-word match when the skill has a strong record", () => {
    const stats = skillStats(Array.from({ length: 5 }, () => ({ skill_name: "chart-helper", outcome: "completed" })));
    expect(selectSkills("make charts", [skill], stats).selected).toHaveLength(1);
  });
});
