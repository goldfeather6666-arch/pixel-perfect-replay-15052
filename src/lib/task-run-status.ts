import { NO_PROGRESS_MS } from "./agent-liveness";

/**
 * A run is presumed dead only after several missed 30s heartbeats. The in-run progress watchdog
 * (NO_PROGRESS_MS) still stops a stuck run fast; this margin stops a live run being restarted
 * because one heartbeat was late or the viewer's clock is skewed.
 */
export const STALE_MS = Math.max(NO_PROGRESS_MS * 3, 180_000);
export function taskRunStatus(task: { running?: boolean; updated_at?: string; keeper_id?: string | null }, now = Date.now()) {
  if (!task.running) return "idle";
  const updated = Date.parse(task.updated_at ?? "");
  if (!Number.isFinite(updated) || now - updated >= STALE_MS) return "stale";
  return task.keeper_id ? "cloud" : "browser";
}