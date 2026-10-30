import { GitHub } from "./github.server";
import { SupabaseMgmt, pendingMigrations } from "./integrations.server";

/** Applies the work branch's not-yet-applied supabase/migrations/*.sql files in order; stops at the first failure. */
export async function applySessionMigrations(
  sb: any,
  s: { id: string; repo: string; work_branch: string; supabase_ref: string | null; applied_migrations: string[] | null },
  ghToken: string,
  supabaseToken: string,
) {
  if (!s.supabase_ref) throw new Error("Link a Supabase project to this task first");
  const gh = new GitHub(ghToken);
  const m = new SupabaseMgmt(supabaseToken);
  const applied = [...(s.applied_migrations ?? [])];
  const todo = pendingMigrations(await gh.tree(s.repo, s.work_branch), applied);
  const done: string[] = [];
  let error: { file: string; message: string } | null = null;
  for (const file of todo) {
    const f = await gh.getFile(s.repo, s.work_branch, file);
    if (!f) continue;
    try {
      await m.runSql(s.supabase_ref, f.content);
      applied.push(file);
      done.push(file);
    } catch (e) {
      error = { file, message: (e as Error).message.slice(0, 1500) };
      break;
    }
  }
  if (done.length) await sb.from("agent_sessions").update({ applied_migrations: applied }).eq("id", s.id);
  return { applied: done, remaining: todo.filter((x) => !done.includes(x)), error };
}
