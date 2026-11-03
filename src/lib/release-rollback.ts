/** C18: decide when a release failed and which earlier build to restore. Pure; the caller performs the Vercel call. */
export type ReleaseDeployment = { id: string; state: string; created: number; commitSha: string | null; target: string | null; url: string };

/** A release failed when Vercel could not build it or the built site answers with a server error. */
export function isFailedRelease(buildState: string, runtimeState: string | null | undefined): boolean {
  return buildState === "ERROR" || runtimeState === "ERROR";
}

/**
 * Newest READY deployment older than the failed one, on the same target (production vs branch).
 * Deployments this run verified (build READY + runtime PASSED) win over merely READY ones.
 */
export function pickRollbackTarget<T extends ReleaseDeployment>(deployments: T[], failedId: string, verified: ReadonlySet<string> = new Set()): T | null {
  const failed = deployments.find((d) => d.id === failedId);
  const before = deployments
    .filter((d) => d.id !== failedId && d.state === "READY" && (!failed || (d.created < failed.created && (d.target ?? null) === (failed.target ?? null))))
    .filter((d) => !failed?.commitSha || d.commitSha !== failed.commitSha)
    .sort((a, b) => b.created - a.created);
  return before.find((d) => verified.has(d.id)) ?? before[0] ?? null;
}

/** Production deployments are restored instantly by promotion; branch deployments by rebuilding the older commit. */
export function rollbackMethod(target: ReleaseDeployment): "promote" | "redeploy" {
  return target.target === "production" ? "promote" : "redeploy";
}
