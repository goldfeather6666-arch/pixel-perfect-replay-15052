import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkFailure, needsFinalCheck, preflightCommand, qualityBlocker } from "@/lib/deployment-quality";

function fixture(scripts: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "forge-preflight-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts }));
  try { return spawnSync("bash", ["-c", preflightCommand("check")], { cwd: dir, encoding: "utf8" }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
describe("production checks", () => {
  it("runs omitted final checks but does not blindly repeat attempted checks", () => {
    const state = { changed: true, localPassed: false, linked: true, supervised: false };
    expect(needsFinalCheck(state)).toBe(true);
    expect(needsFinalCheck({ ...state, localAttempted: true })).toBe(false);
    expect(needsFinalCheck({ ...state, deploymentState: "READY" })).toBe(false);
    expect(needsFinalCheck({ ...state, changed: false })).toBe(false);
  });
  it("preserves timeout blockers without exposing raw output", () => {
    const issue = checkFailure({ exit_code: -1, stderr: "[deadline_exceeded] the operation timed out: secret-value" });
    expect(issue).toContain("timed out");
    expect(issue).not.toContain("secret-value");
    expect(qualityBlocker({ changed: true, localPassed: false, localIssue: issue, linked: true, supervised: false })).toBe(issue);
  });
  it("identifies missing database configuration without printing credentials", () => {
    expect(checkFailure({ exit_code: 1, stderr: "Your project's URL and Key are required to create a Supabase client!" })).toContain("database URL/public-key settings are missing");
  });
  it("identifies the last failed check rather than generic verification", () => {
    expect(checkFailure({ exit_code: 2, stdout: "[Forge check] npm run typecheck\n[Forge exit] 2" })).toContain("typecheck check failed (exit 2)");
  });
  it("keeps failed local checks blocking for supervised and unlinked projects", () => {
    expect(qualityBlocker({ changed: true, localPassed: false, linked: false, supervised: false })).not.toBeNull();
    expect(qualityBlocker({ changed: true, localPassed: false, linked: true, supervised: true })).not.toBeNull();
  });
  it("runs real production scripts successfully", () => {
    const result = fixture({ typecheck: "node -e 'process.exit(0)'", test: "node -e 'process.exit(0)'", build: "node -e 'process.exit(0)'" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("npm run build");
  });
  it("fails on compiler errors and does not claim a build pass", () => {
    const result = fixture({ typecheck: "node -e 'process.exit(2)'", build: "node -e 'process.exit(0)'" });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("npm run build");
  });
  it("requires a production build script", () => { expect(fixture({}).status).toBe(1); });
  it("rejects directory traversal or shell injection", () => {
    expect(() => preflightCommand("check", "../repo")).toThrow();
    expect(() => preflightCommand("check", "app'; echo secret")).toThrow();
  });
  it("requires a healthy deployment even after local checks pass", () => {
    const state = { changed: true, localPassed: true, linked: true, supervised: false };
    expect(qualityBlocker({ ...state, deploymentState: "ERROR" })).not.toBeNull();
    expect(qualityBlocker({ ...state, deploymentState: "RUNTIME_ERROR" })).not.toBeNull();
    expect(qualityBlocker({ ...state, deploymentState: "UNVERIFIED" })).not.toBeNull();
    expect(qualityBlocker({ ...state, deploymentState: "READY" })).toBeNull();
  });
  it("does not require deployment of staged supervised changes", () => {
    expect(qualityBlocker({ changed: true, localPassed: true, linked: true, supervised: true })).toBeNull();
  });
});