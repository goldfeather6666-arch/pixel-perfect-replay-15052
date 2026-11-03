import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { inspectMaintenance, maintenanceDue, maintenancePaths, type MaintenanceFinding } from "./maintenance";
const input = z.object({ id: z.string().uuid() });
type Ctx = { userId: string; supabase: any };
async function task(ctx: Ctx, id: string) {
  const { data, error } = await ctx.supabase.from("agent_sessions").select("id, user_id, repo, work_branch, accounts, is_running").eq("id", id).eq("user_id", ctx.userId).single();
  if (error || !data) throw new Error("Task not found");
  return data;
}
export const getMaintenance = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input).handler(async ({ data, context }) => {
  await task(context, data.id);
  const { data: row, error } = await context.supabase.from("task_maintenance").select("enabled, last_scanned_at, report, dismissed").eq("session_id", data.id).maybeSingle();
  if (error) throw new Error(error.message);
  return { enabled: row?.enabled ?? false, last: row?.last_scanned_at ?? null, findings: (row?.report ?? []) as unknown as MaintenanceFinding[], dismissed: row?.dismissed ?? [] };
});
export const setMaintenance = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input.extend({ enabled: z.boolean() })).handler(async ({ data, context }) => {
  const s = await task(context, data.id);
  if (s.is_running) throw new Error("Wait until the build finishes before changing maintenance settings.");
  const { error } = await context.supabase.from("task_maintenance").upsert({ session_id: data.id, user_id: context.userId, enabled: data.enabled });
  if (error) throw new Error(error.message);
  return { ok: true };
});
export const scanMaintenance = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input.extend({ automatic: z.boolean().default(false) })).handler(async ({ data, context }) => {
  const s = await task(context, data.id);
  if (s.is_running) throw new Error("Maintenance waits until the build finishes.");
  const { data: row, error: readError } = await context.supabase.from("task_maintenance").select("enabled, last_scanned_at").eq("session_id", data.id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!row?.enabled) throw new Error("Enable maintenance before scanning.");
  if (data.automatic && !maintenanceDue(row.enabled, s.is_running, row.last_scanned_at)) return { skipped: true };
  const { accountToken } = await import("./accounts.server");
  const key = await accountToken(context.supabase, context.userId, "github", s.accounts);
  if (!key) throw new Error("Connect this task's GitHub account first.");
  const { GitHub } = await import("./github.server");
  const gh = new GitHub(key);
  const paths = maintenancePaths(await gh.tree(s.repo, s.work_branch));
  const files: { path: string; content: string }[] = [];
  // Bounded read-only inspection: no shell, installations, model requests or repo writes.
  for (let i = 0; i < paths.length; i += 4) {
    const batch = await Promise.all(paths.slice(i, i + 4).map(async (path) => ({ path, file: await gh.getFile(s.repo, s.work_branch, path) })));
    for (const f of batch) if (f.file) files.push({ path: f.path, content: f.file.content.slice(0, 150_000) });
  }
  const report = inspectMaintenance(files);
  const { error } = await context.supabase.from("task_maintenance").update({ last_scanned_at: new Date().toISOString(), report, dismissed: [] }).eq("session_id", data.id).eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  return { scanned: files.length, findings: report.length };
});
export const dismissMaintenance = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input.extend({ finding: z.string().max(1000) })).handler(async ({ data, context }) => {
  await task(context, data.id);
  const { data: row } = await context.supabase.from("task_maintenance").select("dismissed").eq("session_id", data.id).single();
  const { error } = await context.supabase.from("task_maintenance").update({ dismissed: [...new Set([...(row?.dismissed ?? []), data.finding])].slice(-60) }).eq("session_id", data.id).eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
});