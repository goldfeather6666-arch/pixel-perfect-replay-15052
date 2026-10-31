export function taskRunStatus(task: { running?: boolean; updated_at?: string; keeper_id?: string | null }, now = Date.now()) {
  if (!task.running) return "idle";
  const updated = Date.parse(task.updated_at ?? "");
  if (!Number.isFinite(updated) || now - updated >= 120_000) return "stale";
  return task.keeper_id ? "cloud" : "browser";
}