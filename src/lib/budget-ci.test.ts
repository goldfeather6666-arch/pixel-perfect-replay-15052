import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { budgetCheckScript, budgetWorkflow } from "./budget-ci";

function run(budget: unknown, jsBytes: number) {
  const dir = mkdtempSync(join(tmpdir(), "budget-"));
  writeFileSync(join(dir, "check.mjs"), budgetCheckScript());
  writeFileSync(join(dir, "budget.json"), JSON.stringify(budget));
  mkdirSync(join(dir, "dist", "assets"), { recursive: true });
  writeFileSync(join(dir, "dist", "assets", "app.js"), "x".repeat(jsBytes));
  writeFileSync(join(dir, "dist", "assets", "app.js.map"), "x".repeat(999999));
  return spawnSync("node", [join(dir, "check.mjs"), "--root", dir], { encoding: "utf8" });
}

describe("budget CI gate", () => {
  it("fails a JS payload over budget and names the fix", () => {
    const r = run({ jsKb: 100 }, 150 * 1024);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("JavaScript payload over budget (150 > 100)");
    expect(r.stdout).toContain("Code-split the heaviest route");
  });
  it("passes when within budget (source maps ignored)", () => {
    expect(run({ jsKb: 100, totalKb: 120 }, 50 * 1024).status).toBe(0);
  });
  it("fails when LCP is limited but cannot be measured", () => {
    const r = run({ lcpMs: 2500 }, 1024);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("largest contentful paint not measured");
  });
  it("rejects unknown limits", () => {
    expect(run({ jsKB: 100 }, 1).status).toBe(1);
  });
  it("workflow runs on PRs in the project root", () => {
    const w = budgetWorkflow("apps/web");
    expect(w).toContain("pull_request:");
    expect(w).toContain('working-directory: "apps/web"');
  });
});
