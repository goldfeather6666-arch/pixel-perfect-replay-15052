import { accountRow, accountToken } from "./accounts.server";
import { encryptSecret } from "./crypto.server";
import { Vercel } from "./integrations.server";
import { domainName, domainReady, dnsRecords, domainSetupTemplate, secretRequestInput, type SecretRequestInput } from "./project-setup";

type Ctx = { supabase: any; userId: string };
export async function setupContext(ctx: Ctx, taskId: string) {
  const { data: s, error } = await ctx.supabase.from("agent_sessions").select("*").eq("id", taskId).eq("user_id", ctx.userId).maybeSingle();
  if (error || !s) throw new Error("Task not found");
  if (!s.vercel_project_id) throw new Error("Link a Vercel website first");
  const row = await accountRow(ctx.supabase, ctx.userId, "vercel", s.accounts);
  const token = await accountToken(ctx.supabase, ctx.userId, "vercel", s.accounts);
  if (!row || !token) throw new Error("Reconnect the selected Vercel account");
  const v = new Vercel(token);
  const p = await v.project(s.vercel_project_id);
  if (p.repo?.toLowerCase() !== s.repo.toLowerCase()) throw new Error("The selected Vercel website must be linked to this task's repository");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { s, row, v, db: supabaseAdmin };
}

export async function requestProjectSecret(ctx: Ctx, taskId: string, input: SecretRequestInput) {
  const validated = secretRequestInput.parse(input);
  const { s, row, db } = await setupContext(ctx, taskId);
  const { data: old, error: readError } = await db.from("task_secret_requests").select("id,state,vercel_account_id,targets").eq("task_id", taskId).eq("user_id", ctx.userId).eq("vercel_project_id", s.vercel_project_id).eq("name", validated.name).maybeSingle();
  if (readError) throw new Error("Secret request could not be read");
  if (old && old.vercel_account_id === row.id && ["pending", "saving", "synced"].includes(old.state) && JSON.stringify(old.targets) === JSON.stringify(validated.targets)) return { id: old.id, state: old.state, name: validated.name };
  const { data, error } = await db.from("task_secret_requests").upsert({ task_id: taskId, user_id: ctx.userId, vercel_project_id: s.vercel_project_id, vercel_account_id: row.id, name: validated.name, purpose: validated.purpose, source_url: validated.sourceUrl, targets: validated.targets, state: "pending", ciphertext: null, iv: null }, { onConflict: "task_id,vercel_project_id,name" }).select("id,state,name").single();
  if (error) throw new Error("Secret request could not be saved");
  return data;
}

export async function listProjectSecrets(ctx: Ctx, taskId: string) {
  const { data: s, error: ownedError } = await ctx.supabase.from("agent_sessions").select("accounts,vercel_project_id").eq("id", taskId).eq("user_id", ctx.userId).maybeSingle();
  if (ownedError || !s) throw new Error("Task not found");
  if (!s.vercel_project_id) return [];
  const row = await accountRow(ctx.supabase, ctx.userId, "vercel", s.accounts);
  if (!row) return [];
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data, error } = await db.from("task_secret_requests").select("id,name,purpose,source_url,targets,state").eq("task_id", taskId).eq("user_id", ctx.userId).eq("vercel_project_id", s.vercel_project_id).eq("vercel_account_id", row.id).order("created_at");
  if (error) throw new Error("Secret requests could not be loaded");
  return data ?? [];
}

export async function submitProjectSecret(ctx: Ctx, taskId: string, requestId: string, value: string) {
  const { s, row, v, db } = await setupContext(ctx, taskId);
  const { data: r, error } = await db.from("task_secret_requests").select("id,name,state,targets").eq("id", requestId).eq("task_id", taskId).eq("user_id", ctx.userId).eq("vercel_project_id", s.vercel_project_id).eq("vercel_account_id", row.id).maybeSingle();
  if (error || !r) throw new Error("Secret request not found for this website");
  if (r.state === "synced") return { state: "synced" as const, name: r.name };
  if (!["pending", "failed"].includes(r.state)) throw new Error("This secret request is not awaiting a value");
  const enc = await encryptSecret(value);
  const { data: claimed, error: claimError } = await db.from("task_secret_requests").update({ ...enc, state: "saving", updated_at: new Date().toISOString() }).eq("id", r.id).eq("state", r.state).select("id");
  if (claimError || !claimed?.length) throw new Error("This secret is already being saved");
  try {
    await v.setEnv(s.vercel_project_id, { [r.name]: value }, r.targets as ("production" | "preview" | "development")[]);
    const { error: saved } = await db.from("task_secret_requests").update({ state: "synced", updated_at: new Date().toISOString() }).eq("id", r.id).eq("state", "saving");
    if (saved) throw new Error("Sync status could not be saved");
    return { state: "synced" as const, name: r.name };
  } catch {
    await db.from("task_secret_requests").update({ state: "failed", updated_at: new Date().toISOString() }).eq("id", r.id).eq("state", "saving");
    throw new Error("Secret saved encrypted, but Vercel sync failed. Check project access and submit again.");
  }
}

export async function cancelProjectSecret(ctx: Ctx, taskId: string, requestId: string) {
  const { s, row, db } = await setupContext(ctx, taskId);
  const { error } = await db.from("task_secret_requests").update({ state: "cancelled", ciphertext: null, iv: null }).eq("id", requestId).eq("task_id", taskId).eq("user_id", ctx.userId).eq("vercel_project_id", s.vercel_project_id).eq("vercel_account_id", row.id).in("state", ["pending", "failed"]);
  if (error) throw new Error("Secret request could not be cancelled");
  return { cancelled: true };
}

/** Explicit custom domain choice is valid only for unchanged task resources and current verified DNS. */
export async function selectedCustomDomain(userId: string, taskId: string, projectId: string, ref: string, _databaseToken: string, vercelToken: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: s } = await db.from("agent_sessions").select("accounts").eq("id", taskId).eq("user_id", userId).maybeSingle();
  const { data: d } = await db.from("task_domain_setups").select("*").eq("task_id", taskId).eq("user_id", userId).eq("vercel_project_id", projectId).maybeSingle();
  if (!s || !d || d.database_ref !== ref || !["verified", "configured"].includes(d.state)) return undefined;
  const [vr, br] = await Promise.all([accountRow(db, userId, "vercel", s.accounts), accountRow(db, userId, "supabase", s.accounts)]);
  if (vr?.id !== d.vercel_account_id || br?.id !== d.database_account_id) return undefined;
  const v = new Vercel(vercelToken);
  const [record, config] = await Promise.all([v.domain(projectId, d.domain), v.domainConfig(projectId, d.domain)]);
  return domainReady(record, config) ? d.domain : undefined;
}

export async function addProjectDomain(ctx: Ctx, taskId: string, name: string) {
  const domain = domainName.parse(name);
  const { s, row, v, db } = await setupContext(ctx, taskId);
  if (s.running) throw new Error("Wait for the agent to finish before changing the domain");
  const databaseRow = await accountRow(ctx.supabase, ctx.userId, "supabase", s.accounts);
  const existing = await v.domains(s.vercel_project_id);
  if (!existing.includes(domain)) await v.addDomain(s.vercel_project_id, domain);
  const { error } = await db.from("task_domain_setups").upsert({ task_id: taskId, user_id: ctx.userId, vercel_project_id: s.vercel_project_id, vercel_account_id: row.id, database_ref: s.supabase_ref, database_account_id: databaseRow?.id ?? null, domain, state: "pending", sync_error: null, approved_at: new Date().toISOString() }, { onConflict: "task_id,vercel_project_id" });
  if (error) throw new Error("Domain added to Vercel, but setup could not be saved. Try again.");
  return { domain };
}

export async function checkProjectDomain(ctx: Ctx, taskId: string) {
  const { s, row, v, db } = await setupContext(ctx, taskId);
  const { data: d, error } = await db.from("task_domain_setups").select("*").eq("task_id", taskId).eq("user_id", ctx.userId).eq("vercel_project_id", s.vercel_project_id).eq("vercel_account_id", row.id).maybeSingle();
  if (error) throw new Error("Domain setup could not be read");
  if (!d) return null;
  let record = await v.domain(s.vercel_project_id, d.domain);
  if (record.verified !== true) { try { record = await v.verifyDomain(s.vercel_project_id, d.domain); } catch { /* DNS may still be pending. */ } }
  const config = await v.domainConfig(s.vercel_project_id, d.domain);
  const ready = domainReady(record, config);
  const template = domainSetupTemplate(d.domain);
  let state = ready ? "verified" : "pending";
  let syncError: string | null = null;
  if (ready) {
    if (s.running) syncError = "Domain verified. Setup will synchronize after the agent finishes.";
    else try {
      const databaseRow = await accountRow(ctx.supabase, ctx.userId, "supabase", s.accounts);
      if (s.supabase_ref !== d.database_ref || (databaseRow?.id ?? null) !== d.database_account_id) throw new Error("Database connection changed. Add the domain again to approve the new setup.");
      if (d.state !== "configured") {
        await v.setEnv(s.vercel_project_id, template.env, ["production"]);
        if (s.supabase_ref) {
          const st = await accountToken(ctx.supabase, ctx.userId, "supabase", s.accounts);
          if (!st) throw new Error("Reconnect the selected database account to update sign-in links.");
          const { syncCustomerAuth } = await import("./customer-auth.server");
          await syncCustomerAuth(s.supabase_ref, st, await v.domains(s.vercel_project_id), d.domain);
        }
      }
      state = "configured";
    } catch { syncError = "Domain verified, but website/auth settings are not fully synchronized. Check selected accounts and use Check again."; }
  }
  const { error: saved } = await db.from("task_domain_setups").update({ state, sync_error: syncError, updated_at: new Date().toISOString() }).eq("id", d.id);
  if (saved) throw new Error("Domain status could not be saved");
  return { domain: d.domain, state, records: dnsRecords(d.domain, record, config), syncError, template, checkedAt: new Date().toISOString() };
}