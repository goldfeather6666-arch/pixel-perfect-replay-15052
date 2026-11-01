import { accountToken } from "./accounts.server";
import { redactPreviewDiagnostic, type PreviewDiagnosis, type PreviewServiceCheck } from "./preview-repair";

/** Caller supplies an owner-verified task. No SQL, setting updates, releases or secret DTOs. */
export async function diagnosePreview(sb: any, task: { id: string; user_id: string; repo: string; work_branch: string; accounts?: unknown; supabase_ref?: string | null; vercel_project_id?: string | null; applied_migrations?: string[] }) : Promise<PreviewDiagnosis> {
  const { SupabaseMgmt, Vercel, pendingMigrations } = await import("./integrations.server");
  const { latestPreview, previewLogs, previewEnvironment } = await import("./preview-manager.server");
  const check = async (service: string, run: () => Promise<Omit<PreviewServiceCheck, "service">>): Promise<PreviewServiceCheck> => {
    try { const result = await run(); return { service, ...result, detail: redactPreviewDiagnostic(result.detail).slice(0, 6000) }; }
    catch (e) {
      const m = String((e as Error)?.message ?? "");
      return { service, state: "error", detail: /401|unauthor/i.test(m) ? "Saved account was rejected; reconnect it." : /403|permission/i.test(m) ? "Saved account lacks access to the linked project." : "Check could not complete; availability or saved-account access is unverified. Retry diagnosis." };
    }
  };
  const checks = await Promise.all([
    check("Preview server", async () => {
      const row = await latestPreview(sb, task.id);
      if (!row) return { state: "unlinked", detail: "Preview has not started." };
      const logs = redactPreviewDiagnostic(await previewLogs(row, 6000));
      return { state: ["error", "crashed", "expired", "unhealthy"].includes(row.status) ? "error" : row.status === "ready" ? "ok" : "warn", detail: `Status: ${row.status}; branch: ${row.branch_name}\n${logs || "No server output captured."}` };
    }),
    check("Database", async () => {
      if (!task.supabase_ref) return { state: "unlinked", detail: "No database linked to this task." };
      const token = await accountToken(sb, task.user_id, "supabase", task.accounts);
      if (!token) return { state: "error", detail: "Linked database account is missing." };
      const db = new SupabaseMgmt(token);
      const [status, auth] = await Promise.all([db.status(task.supabase_ref), db.authConfig(task.supabase_ref)]);
      return { state: status === "ACTIVE_HEALTHY" ? "ok" : "warn", detail: `Project status: ${status}; sign-in configuration readable; site URL ${auth.site_url ? "set" : "missing"}; return-link count: ${(auth.uri_allow_list ?? "").split(",").filter(Boolean).length}. Application data and signed-in access have not been tested.` };
    }),
    check("Preview database settings", async () => {
      if (!task.supabase_ref) return { state: "unlinked", detail: "No database linked." };
      const row = await latestPreview(sb, task.id);
      if (!row) return { state: "warn", detail: "Start preview to check its public database settings." };
      const configured = await previewEnvironment(row);
      return { state: configured ? "ok" : "warn", detail: configured ? "Public database settings are present in the preview process configuration. No private keys inspected." : "Public database settings missing or sandbox unavailable. Check saved public settings, then restart preview." };
    }),
    check("Database migrations", async () => {
      if (!task.supabase_ref) return { state: "unlinked", detail: "No database linked." };
      const token = await accountToken(sb, task.user_id, "github", task.accounts);
      if (!token) return { state: "warn", detail: "GitHub access missing; migration files unverified." };
      const { GitHub } = await import("./github.server");
      const pending = pendingMigrations(await new GitHub(token).tree(task.repo, task.work_branch), task.applied_migrations ?? []);
      return { state: pending.length ? "warn" : "ok", detail: pending.length ? `Waiting for application under normal approval rules: ${pending.slice(0, 20).join(", ")}` : "No unapplied migration files in task tracking. Database schema drift not checked." };
    }),
    check("Vercel", async () => {
      if (!task.vercel_project_id) return { state: "unlinked", detail: "No Vercel website linked." };
      const token = await accountToken(sb, task.user_id, "vercel", task.accounts);
      if (!token) return { state: "error", detail: "Linked Vercel account is missing." };
      const v = new Vercel(token);
      const [project, builds] = await Promise.all([v.project(task.vercel_project_id), v.deployments(task.vercel_project_id, task.work_branch)]);
      if (project.repo?.toLowerCase() !== task.repo.toLowerCase()) return { state: "warn", detail: "Vercel repository link differs from this task; review it in Deploy." };
      const latest = builds[0];
      if (!latest) return { state: "warn", detail: "Project accessible; no deployment for this task branch. No deployment started." };
      if (latest.state === "ERROR") {
        const log = await v.buildLog(latest.id);
        const { diagnoseDeploymentFailure } = await import("./deployment-diagnosis");
        const diagnosis = diagnoseDeploymentFailure(log);
        return { state: "error", detail: `Build failed. Diagnosis: ${diagnosis.summary}\nCategory: ${diagnosis.category}; confidence: ${diagnosis.confidence}\nEvidence:\n${diagnosis.evidence.join("\n") || "No matching error lines captured."}\nRecommended next actions:\n${diagnosis.nextActions.map((action, i) => `${i + 1}. ${action}`).join("\n")}` };
      }
      if (latest.state === "READY") {
        const { checkDeploymentRuntime } = await import("./deployment-runtime.server");
        const health = await checkDeploymentRuntime(latest.url);
        return { state: health.state === "PASSED" ? "ok" : health.state === "ERROR" ? "error" : "warn", detail: `Branch deployment: ${latest.state}; ${health.note}. Deployment may predate current task edits.` };
      }
      return { state: "warn", detail: `Latest branch build: ${latest.state}.` };
    }),
  ]);
  return { checkedAt: new Date().toISOString(), checks };
}