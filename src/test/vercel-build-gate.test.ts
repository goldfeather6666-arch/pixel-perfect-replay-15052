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

import { withAgentDeploysDisabled, deployLimit, deployLimitMessage } from "@/lib/vercel-build-gate";
import { qualityBlocker } from "@/lib/deployment-quality";
import { describe as d2, it as i2, expect as e2 } from "vitest";

d2("agent branch push deploys", () => {
  i2("creates vercel.json disabling agent/* pushes when missing", () => {
    e2(JSON.parse(withAgentDeploysDisabled(null)!)).toEqual({ git: { deploymentEnabled: { "agent/*": false } } });
  });
  i2("keeps existing settings and branch rules", () => {
    const out = JSON.parse(withAgentDeploysDisabled(JSON.stringify({ framework: "nextjs", git: { deploymentEnabled: { "dev": false } } }))!);
    e2(out).toEqual({ framework: "nextjs", git: { deploymentEnabled: { dev: false, "agent/*": false } } });
  });
  i2("does nothing when already disabled or the file is not valid JSON", () => {
    e2(withAgentDeploysDisabled(JSON.stringify({ git: { deploymentEnabled: { "agent/*": false } } }))).toBeNull();
    e2(withAgentDeploysDisabled(JSON.stringify({ git: { deploymentEnabled: false } }))).toBeNull();
    e2(withAgentDeploysDisabled("{ broken")).toBeNull();
  });
});

d2("Vercel daily deployment limit", () => {
  const body = { error: { code: "payment_required", message: 'Resource is limited - try again in 24 hours (more than 100, code: "api-deployments-free-per-day").', limit: { total: 100, remaining: 0, reset: 10 * 3_600_000 }, resource: "api-deployments-free-per-day" } };
  i2("recognises Vercel's real 100-per-day refusal", () => {
    e2(deployLimit(402, body)).toEqual({ total: 100, resetAt: 36_000_000 });
    e2(deployLimitMessage(deployLimit(402, body)!, 0)).toContain("100 deploys a day");
    e2(deployLimitMessage(deployLimit(402, body)!, 0)).toContain("about 10 hour");
  });
  i2("does not treat ordinary errors as the limit", () => {
    e2(deployLimit(400, { error: { code: "bad_request", message: "Invalid gitSource" } })).toBeNull();
  });
  i2("a limited deploy does not trigger the repair loop", () => {
    e2(qualityBlocker({ changed: true, localPassed: true, linked: true, supervised: false, deploymentState: "LIMITED" })).toBeNull();
    e2(qualityBlocker({ changed: true, localPassed: true, linked: true, supervised: false, deploymentState: "ERROR" })).not.toBeNull();
  });
});
