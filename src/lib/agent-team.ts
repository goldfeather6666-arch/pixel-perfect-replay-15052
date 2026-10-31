import { z } from "zod";

export const MAX_TEAM_JOBS = 12;
// Reserve outbound slots for the coordinator's progress saves and Stop polling.
export const ACTIVE_TEAM_WORKERS = 4;
// Limits are generous on purpose: models write detailed briefs and large file assignments, and a
// rejected dispatch tends to be retried verbatim, stalling the whole run.
export const MAX_JOB_TASK_CHARS = 20000;
export const MAX_JOB_PATHS = 40;
export const teamJobSchema = z.object({
  label: z.string().min(1).transform((s) => s.slice(0, 60)),
  role: z.enum(["explorer", "coder", "reviewer", "tester"]).default("explorer"),
  task: z.string().min(5).max(MAX_JOB_TASK_CHARS),
  paths: z.array(z.string().min(1).max(300)).max(MAX_JOB_PATHS).default([]),
});
// Some models send the array as a JSON string; accept both spellings so a whole wave cannot
// be lost to a formatting quirk.
const jobsField = z.preprocess(
  (v) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v),
  z.array(teamJobSchema).min(1).max(MAX_TEAM_JOBS),
);
export const teamSchema = z.object({ jobs: jobsField });
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

/** Abortable wait used for provider rate-limit backoff between worker attempts. */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    }, { once: true });
  });
}

export function proposalConflict(proposal: CodeProposal, current: string | null): string | null {
  return proposal.original === current ? null : `File ${proposal.path} changed after the helper read it. Review and reassign instead of overwriting newer work.`;
}