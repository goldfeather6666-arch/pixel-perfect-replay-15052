import { describe, expect, it } from "vitest";
import { waitForDeployment, type Deployment } from "@/lib/integrations.server";

const row = (id: string, sha: string, state = "READY", created = 1): Deployment => ({ id, commitSha: sha, state, created, branch: "forge/task", target: null, url: "https://example.org" });
describe("current commit deployment verification", () => {
  it("never reports an old READY build for a new commit", async () => {
    const v = { deployments: async () => [row("old", "old-sha")] };
    expect(await waitForDeployment(v, "project", "forge/task", 0, { commitSha: "new-sha" })).toBeNull();
  });
  it("returns the current commit's actual failure", async () => {
    const v = { deployments: async () => [row("old", "old-sha"), row("new", "new-sha", "ERROR", 2)] };
    expect(await waitForDeployment(v, "project", "forge/task", 0, { commitSha: "new-sha" })).toMatchObject({ id: "new", state: "ERROR" });
  });
  it("requires the requested rebuild ID, not a previous build of the same commit", async () => {
    const v = { deployments: async () => [row("previous", "sha"), row("rebuild", "sha", "BUILDING", 2)] };
    expect(await waitForDeployment(v, "project", "forge/task", 0, { commitSha: "sha", deploymentId: "rebuild" })).toMatchObject({ id: "rebuild", state: "BUILDING" });
  });
  it("sorts matching builds by creation time", async () => {
    const v = { deployments: async () => [row("old", "sha"), row("latest", "sha", "READY", 3)] };
    expect(await waitForDeployment(v, "project", "forge/task", 0, { commitSha: "sha" })).toMatchObject({ id: "latest" });
  });
});