import { describe, expect, it } from "vitest";
import { diagnoseDeploymentFailure } from "@/lib/deployment-diagnosis";

describe("Vercel deployment diagnosis", () => {
  it("recognizes missing Supabase environment settings without requiring values", () => {
    const result = diagnoseDeploymentFailure("Error: SUPABASE_URL is not set");
    expect(result.category).toBe("missing_environment");
    expect(result.nextActions.join(" ")).toContain("Connect & sync");
  });
  it("recognizes package manager and lockfile failures", () => {
    expect(diagnoseDeploymentFailure("ERR_PNPM_OUTDATED_LOCKFILE: Cannot install with frozen lockfile").category).toBe("dependency_install");
  });
  it("recognizes TypeScript failures", () => {
    expect(diagnoseDeploymentFailure("src/page.tsx(4,2): error TS2304: Cannot find name").category).toBe("typescript");
  });
  it("recognizes Vercel quota failures and tells the agent not to retry", () => {
    const result = diagnoseDeploymentFailure("Deployment limit exceeded: deployments-per-day");
    expect(result.category).toBe("deployment_quota");
    expect(result.nextActions.join(" ")).toContain("Stop retrying");
  });
  it("recognizes auth and database failures without suggesting RLS bypass", () => {
    const result = diagnoseDeploymentFailure("Supabase database error: relation profiles does not exist");
    expect(result.category).toBe("database_or_auth");
    expect(result.nextActions.join(" ")).toContain("Never bypass RLS");
  });
  it("redacts tokens in evidence", () => {
    const result = diagnoseDeploymentFailure("Error: fetch failed token=ghp_abcdef1234567890abcdef1234567890ab");
    expect(result.evidence.join(" ")).not.toContain("ghp_abcdef1234567890abcdef1234567890ab");
  });
  it("does not invent a root cause for unknown logs", () => {
    const result = diagnoseDeploymentFailure("Build stopped unexpectedly");
    expect(result.category).toBe("unknown");
    expect(result.confidence).toBe("low");
  });
});
