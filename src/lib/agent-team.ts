import { z } from "zod";

export const MAX_TEAM_JOBS = 12;
// Reserve outbound slots for the coordinator's progress saves and Stop polling.
export const ACTIVE_TEAM_WORKERS = 4;
export const teamJobSchema = z.object({
  label: z.string().min(2).max(60),
  role: z.enum(["explorer", "coder", "reviewer", "tester"]).default("explorer"),
  task: z.string().min(5).max(4000),
  paths: z.array(z.string().min(1).max(300)).max(20).default([]),
});
export const teamSchema = z.object({ jobs: z.array(teamJobSchema).min(1).max(MAX_TEAM_JOBS) });
export type CodeProposal = { id: string; path: string; content: string; original: string | null; label: string };

export function ownsPath(paths: string[], path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some((p) => !p || p === "." || p === "..")) return false;
  return paths.includes(path);
}

/** Ordered results, bounded parallel execution, and no new work after Stop. */
export async function parallelMap<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      signal?.throwIfAborted();
      const index = cursor++;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await run(item, index);
    }
  }));
  return results;
}

export function proposalConflict(proposal: CodeProposal, current: string | null): string | null {
  return proposal.original === current ? null : `File ${proposal.path} changed after the helper read it. Review and reassign instead of overwriting newer work.`;
}