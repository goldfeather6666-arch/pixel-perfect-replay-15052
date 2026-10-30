import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { preflightCommand, qualityBlocker } from "@/lib/deployment-quality";

function fixture(scripts: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "forge-preflight-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts }));
  try { return spawnSync("bash", ["-c", preflightCommand("check")], { cwd: dir, encoding: "utf8" }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
describe("production checks", () => {
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
    expect(qualityBlocker({ ...state, deploymentState: "READY" })).toBeNull();
  });
  it("does not require deployment of staged supervised changes", () => {
    expect(qualityBlocker({ changed: true, localPassed: true, linked: true, supervised: true })).toBeNull();
  });
});