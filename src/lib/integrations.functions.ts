import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Ctx = { supabase: any; userId: string };

async function token(ctx: Ctx, provider: "supabase" | "vercel" | "github") {
  const { data } = await ctx.supabase.from("provider_credentials").select("ciphertext, iv").eq("provider", provider).order("created_at", { ascending: false }).limit(1);
  if (!data?.length) return null;
  const { decryptSecret } = await import("./crypto.server");
  return decryptSecret(data[0].ciphertext, data[0].iv) as Promise<string>;
}
async function need(ctx: Ctx, provider: "supabase" | "vercel") {
  const t = await token(ctx, provider);
  if (!t) throw new Error(`Add a ${provider === "supabase" ? "Supabase" : "Vercel"} token in Settings first`);
  return t;
}
async function sessionRow(ctx: Ctx, id: string) {
  const { data, error } = await ctx.supabase.from("agent_sessions").select("*").eq("id", id).eq("user_id", ctx.userId).single();
  if (error || !data) throw new Error("Task not found");
  return data;
}

export const getIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await sessionRow(context, data.id);
    const { data: creds } = await context.supabase.from("provider_credentials").select("provider").in("provider", ["supabase", "vercel"]);
    const has = new Set((creds ?? []).map((c: { provider: string }) => c.provider));
    return {
      hasSupabase: has.has("supabase"),
      hasVercel: has.has("vercel"),
      supabase_ref: s.supabase_ref as string | null,
      vercel_project_id: s.vercel_project_id as string | null,
      applied: (s.applied_migrations ?? []) as string[],
    };
  });

export const listSupabaseOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { SupabaseMgmt } = await import("./integrations.server");
    const m = new SupabaseMgmt(await need(context, "supabase"));
    const [projects, orgs] = await Promise.all([m.projects(), m.orgs()]);
    return { projects, orgs };
  });

export const listVercelProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { Vercel } = await import("./integrations.server");
    return new Vercel(await need(context, "vercel")).projects();
  });

/** Copies the linked Supabase project's public URL and anon key into the linked Vercel project. */
async function wireEnv(ctx: Ctx, ref: string | null, vercelId: string | null) {
  if (!ref || !vercelId) return;
  const st = await token(ctx, "supabase");
  const vt = await token(ctx, "vercel");
  if (!st || !vt) return;
  const { syncSupabaseToVercel } = await import("./integrations.server");
  await syncSupabaseToVercel(st, vt, ref, vercelId);
}

/** Re-syncs Supabase keys into Vercel and rebuilds the branch's latest deployment so they apply. */
export const syncDeployEnv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), redeploy: z.boolean().default(true) }))
  .handler(async ({ data, context }) => {
    const s = await sessionRow(context, data.id);
    if (!s.supabase_ref || !s.vercel_project_id) throw new Error("Link both Supabase and Vercel first");
    const { syncSupabaseToVercel, Vercel, DeployLimitError, startForgeDeploy } = await import("./integrations.server");
    const vt = await need(context, "vercel");
    await syncSupabaseToVercel(await need(context, "supabase"), vt, s.supabase_ref, s.vercel_project_id);
    let redeployed: string | null = null;
    if (data.redeploy) {
      // Build the branch's CURRENT code once (rebuilding the last deployment would rebuild an old commit).
      const gt = await token(context, "github");
      if (!gt) throw new Error("Add a GitHub token in Settings first");
      const { GitHub } = await import("./github.server");
      try {
        await startForgeDeploy(new Vercel(vt), new GitHub(gt), s.vercel_project_id, s.repo, s.work_branch);
      } catch (e) {
        if (e instanceof DeployLimitError) {
          const { deployLimitMessage } = await import("./vercel-build-gate");
          throw new Error(`Database keys were sent, but no rebuild started. ${deployLimitMessage(e)}`);
        }
        throw e;
      }
      redeployed = "started";
    }
    return { synced: true, redeployed };
  });

export const linkSupabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.union([
      z.object({ id: z.string().uuid(), ref: z.string().regex(/^[a-z0-9]{10,40}$/) }),
      z.object({ id: z.string().uuid(), create: z.object({ name: z.string().trim().min(1).max(60), orgId: z.string().min(1).max(100), region: z.string().min(2).max(40) }) }),
      z.object({ id: z.string().uuid(), unlink: z.literal(true) }),
    ]),
  )
  .handler(async ({ data, context }) => {
    const s = await sessionRow(context, data.id);
    let ref: string | null = null;
    if ("ref" in data) {
      const { SupabaseMgmt } = await import("./integrations.server");
      const list = await new SupabaseMgmt(await need(context, "supabase")).projects();
      if (!list.some((p) => p.ref === data.ref)) throw new Error("That Supabase project isn't in your account");
      ref = data.ref;
    } else if ("create" in data) {
      const { SupabaseMgmt } = await import("./integrations.server");
      ref = (await new SupabaseMgmt(await need(context, "supabase")).createProject(data.create.name, data.create.orgId, data.create.region)).ref;
    }
    const { error } = await context.supabase.from("agent_sessions").update({ supabase_ref: ref, applied_migrations: [] }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await wireEnv(context, ref, s.vercel_project_id).catch(() => {});
    return { ref };
  });

export const linkVercel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.union([
      z.object({ id: z.string().uuid(), projectId: z.string().min(1).max(100) }),
      z.object({ id: z.string().uuid(), create: z.literal(true) }),
      z.object({ id: z.string().uuid(), unlink: z.literal(true) }),
    ]),
  )
  .handler(async ({ data, context }) => {
    const s = await sessionRow(context, data.id);
    let pid: string | null = null;
    if (!("unlink" in data)) {
      const { Vercel } = await import("./integrations.server");
      const v = new Vercel(await need(context, "vercel"));
      if ("projectId" in data) {
        if (!(await v.projects()).some((p) => p.id === data.projectId)) throw new Error("That Vercel project isn't in your account");
        pid = data.projectId;
      } else {
        pid = (await v.createProject(String(s.repo).split("/")[1] ?? "app", s.repo)).id;
      }
    }
    const { error } = await context.supabase.from("agent_sessions").update({ vercel_project_id: pid }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await wireEnv(context, s.supabase_ref, pid).catch(() => {});
    if (pid) { const { Vercel } = await import("./integrations.server"); await new Vercel(await need(context, "vercel")).ensureBuildGate(pid).catch(() => {}); }
    return { projectId: pid };
  });

export const getDeployments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await sessionRow(context, data.id);
    if (!s.vercel_project_id) return { deployments: [], log: null as string | null, runtime: null };
    const { Vercel } = await import("./integrations.server");
    const v = new Vercel(await need(context, "vercel"));
    const deployments = (await v.deployments(s.vercel_project_id, s.work_branch)).slice(0, 5);
    const latest = deployments[0];
    const log = latest && latest.state === "ERROR" ? await v.buildLog(latest.id).catch(() => null) : null;
    const { checkDeploymentRuntime } = await import("./deployment-runtime.server");
    const runtime = latest?.state === "READY" ? await checkDeploymentRuntime(latest.url) : null;
    return { deployments, log, runtime };
  });

export const getMigrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await sessionRow(context, data.id);
    const gt = await token(context, "github");
    if (!gt) throw new Error("Add a GitHub token in Settings first");
    const { GitHub } = await import("./github.server");
    const { pendingMigrations } = await import("./integrations.server");
    const tree = await new GitHub(gt).tree(s.repo, s.work_branch);
    let dbStatus: string | null = null;
    if (s.supabase_ref) {
      const { SupabaseMgmt } = await import("./integrations.server");
      dbStatus = await new SupabaseMgmt(await need(context, "supabase")).status(s.supabase_ref).catch(() => null);
    }
    return { pending: pendingMigrations(tree, s.applied_migrations ?? []), applied: (s.applied_migrations ?? []) as string[], dbStatus };
  });

export const applyMigrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await sessionRow(context, data.id);
    const gt = await token(context, "github");
    if (!gt) throw new Error("Add a GitHub token in Settings first");
    const { applySessionMigrations } = await import("./migrations.server");
    return applySessionMigrations(context.supabase, s, gt, await need(context, "supabase"));
  });
