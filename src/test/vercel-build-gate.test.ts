import { describe, it, expect } from "vitest";
import { shouldBuild, gateUpdate, BUILD_GATE_COMMAND, DEPLOY_MARKER } from "@/lib/vercel-build-gate";
import { execFileSync } from "node:child_process";

const run = (ref: string, msg: string) => {
  try { execFileSync("sh", ["-c", BUILD_GATE_COMMAND], { env: { VERCEL_GIT_COMMIT_REF: ref, VERCEL_GIT_COMMIT_MESSAGE: msg } }); return "skip"; }
  catch { return "build"; }
};
describe("vercel build gate", () => {
  it("skips ordinary agent file commits", () => {
    expect(shouldBuild("agent/abc", "feat: add hero")).toBe(false);
    expect(run("agent/abc", "feat: add hero")).toBe("skip");
  });
  it("builds agent commits marked for deploy", () => {
    expect(shouldBuild("agent/abc", `chore: deploy ${DEPLOY_MARKER}`)).toBe(true);
    expect(run("agent/abc", `chore: deploy ${DEPLOY_MARKER}`)).toBe("build");
  });
  it("always builds non-agent branches", () => {
    expect(run("main", "anything")).toBe("build");
  });
  it("never overwrites a user's own ignore command", () => {
    expect(gateUpdate("git diff --quiet HEAD^ HEAD .")).toBeNull();
    expect(gateUpdate(null)).toBe(BUILD_GATE_COMMAND);
  });
});
