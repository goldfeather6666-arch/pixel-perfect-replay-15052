import { NO_PROGRESS_MS } from "./agent-liveness";

/** Missing heartbeat uses the same inactivity limit as the progress watchdog. */
export const STALE_MS = 60_000;
export function taskRunStatus(task: { running?: boolean; updated_at?: string; keeper_id?: string | null }, now = Date.now()) {
  if (!task.running) return "idle";
  const updated = Date.parse(task.updated_at ?? "");
  if (!Number.isFinite(updated) || now - updated >= STALE_MS) return "stale";
  return task.keeper_id ? "cloud" : "browser";
}