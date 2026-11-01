import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { appendPreviewErrors, redactPreviewDiagnostic } from "./preview-repair";

type Ctx = { supabase: any; userId: string };

async function ownedTask(ctx: Ctx, id: string) {
  const { data, error } = await ctx.supabase.from("agent_sessions").select("*").eq("id", id).eq("user_id", ctx.userId).single();
  if (error || !data) throw new Error("Task not found");
  return data;
}

async function ownedPreview(ctx: Ctx, taskId: string) {
  await ownedTask(ctx, taskId);
  const { latestPreview } = await import("./preview-manager.server");
  return latestPreview(ctx.supabase, taskId);
}

async function githubToken(ctx: Ctx, accounts?: unknown) {
  const { accountToken } = await import("./accounts.server");
  const key = await accountToken(ctx.supabase, ctx.userId, "github", accounts);
  if (!key) throw new Error("Add a GitHub token in Settings first");
  return key;
}

/** Client-safe view of a preview row (no internal sandbox host or tokens). */
function view(r: any) {
  if (!r) return null;
  return {
    id: r.id as string, status: r.status as string, framework: r.framework as string, port: r.port as number,
    branch: r.branch_name as string, command: r.command as string, base: r.preview_url as string,
    expiresAt: r.expires_at as string, lastCheck: (r.last_health_check_at as string | null) ?? null,
    restarts: Number(r.process?.restarts ?? 0), lastHttp: (r.process?.last_http as number | undefined) ?? null,
    shareUntil: (r.share_until as string | null) ?? null, logTail: redactPreviewDiagnostic((r.logTail as string | undefined) ?? "").slice(-30_000),
    browserErrors: (Array.isArray(r.browser_errors) ? r.browser_errors : []).slice(-50).map((e: { m?: string; path?: string; at?: string }): { m: string; path?: string; at: string } => {
      const path = typeof e.path === "string" ? e.path.split(/[?#]/, 1)[0]!.replace(/[\\r\\n\\\\]/g, "").slice(0, 300) : undefined;
      return { m: redactPreviewDiagnostic(e.m ?? "").slice(0, 1000), ...(path !== undefined ? { path } : {}), at: e.at ?? "" };
    }),
  };
}
export type PreviewView = NonNullable<ReturnType<typeof view>>;

const Task = z.object({ id: z.string().uuid() });

export const diagnosePreviewFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(Task)
  .handler(async ({ data, context }) => {
    const task = await ownedTask(context, data.id);
    const { diagnosePreview } = await import("./preview-diagnosis.server");
    return diagnosePreview(context.supabase, task);
  });

export const getPreview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(Task)
  .handler(async ({ data, context }) => {
    const row = await ownedPreview(context, data.id);
    if (!row) return null;
    const { previewStatus } = await import("./preview-manager.server");
    return view(await previewStatus(context.supabase, row, { autoRestart: true }));
  });

export const startPreviewFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(Task.extend({ command: z.string().max(2000).optional(), port: z.number().int().min(1024).max(65535).optional() }))
  .handler(async ({ data, context }) => {
    const s = await ownedTask(context, data.id);
    const { startPreview } = await import("./preview-manager.server");
    return view(await startPreview(context.supabase, s, await githubToken(context, s.accounts), { ...(data.command ? { command: data.command } : {}), ...(data.port ? { port: data.port } : {}) }));
  });

export const previewActionFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(Task.extend({ action: z.enum(["stop", "restart", "logs"]) }))
  .handler(async ({ data, context }) => {
    const row = await ownedPreview(context, data.id);
    if (!row) throw new Error("No preview for this task yet");
    const m = await import("./preview-manager.server");
    if (data.action === "logs") return { logs: redactPreviewDiagnostic(await m.previewLogs(row, 30_000)).slice(-30_000) };
    if (data.action === "stop") { await m.stopPreview(context.supabase, row); return { ok: true }; }
    await m.restartPreview(context.supabase, row, await ownedTask(context, data.id));
    return { ok: true };
  });

/** Issues a short-lived signed URL for the private gateway ("own"), or a time-limited share link. */
export const previewAccessFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(Task.extend({ kind: z.enum(["own", "share"]).default("own"), minutes: z.number().int().min(5).max(240).default(60) }))
  .handler(async ({ data, context }) => {
    const row = await ownedPreview(context, data.id);
    if (!row || !["starting", "ready", "unhealthy", "error"].includes(row.status)) throw new Error("Preview is not running");
    const { signPreviewToken, previewSecret } = await import("./preview-token.server");
    const mins = data.kind === "own" ? 30 : data.minutes;
    const exp = Date.now() + mins * 60_000;
    if (data.kind === "share") await context.supabase.from("preview_sessions").update({ share_until: new Date(exp).toISOString() }).eq("id", row.id);
    const token = await signPreviewToken({ p: row.id, u: context.userId, v: row.token_version, e: exp, k: data.kind }, previewSecret());
    return { url: `${row.preview_url}?forge_t=${encodeURIComponent(token)}`, expiresAt: new Date(exp).toISOString() };
  });

/** Revokes every outstanding link (own + share) without stopping the server. */
export const revokePreviewLinks = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(Task)
  .handler(async ({ data, context }) => {
    const row = await ownedPreview(context, data.id);
    if (!row) return { ok: true };
    await context.supabase.from("preview_sessions").update({ token_version: row.token_version + 1, share_until: null }).eq("id", row.id);
    return { ok: true };
  });

export const reportPreviewErrors = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(Task.extend({ errors: z.array(z.object({ m: z.string().max(1000), path: z.string().max(300).optional() })).max(20) }))
  .handler(async ({ data, context }) => {
    const row = await ownedPreview(context, data.id);
    if (!row) return { ok: false };
    const prev = Array.isArray(row.browser_errors) ? row.browser_errors : [];
    const { errors, accepted } = appendPreviewErrors(prev, data.errors);
    if (accepted) await context.supabase.from("preview_sessions").update({ browser_errors: errors }).eq("id", row.id);
    return { ok: true, accepted };
  });
