/** A run only counts as dead after this long without any heartbeat (no 2-minute auto-stop). */
export const STALE_MS = 15 * 60_000;
export function taskRunStatus(task: { running?: boolean; updated_at?: string; keeper_id?: string | null }, now = Date.now()) {
  if (!task.running) return "idle";
  const updated = Date.parse(task.updated_at ?? "");
  if (!Number.isFinite(updated) || now - updated >= STALE_MS) return "stale";
  return task.keeper_id ? "cloud" : "browser";
}