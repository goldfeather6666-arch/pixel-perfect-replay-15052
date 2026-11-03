import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildSnapshot, hashToken, newToken, reviewBadges, shareActive, validWebhook } from "./sharing";
import { verificationHistory, type VerificationEvent } from "./verification-history";

type Ctx = { userId: string; supabase: any };
const idIn = z.object({ id: z.string().uuid() });

async function ownTask(ctx: Ctx, id: string) {
  const { data, error } = await ctx.supabase.from("agent_sessions").select("id, title, repo, messages").eq("id", id).eq("user_id", ctx.userId).single();
  if (error || !data) throw new Error("Task not found");
  return data as { id: string; title: string; repo: string; messages: unknown };
}

/** Best-effort Slack/Teams notice; failures never block the owner action. */
async function notify(ctx: Ctx, text: string) {
  const { data } = await ctx.supabase.from("notification_settings").select("webhook_url").eq("user_id", ctx.userId).maybeSingle();
  const url = data?.webhook_url as string | undefined;
  if (!url || !validWebhook(url)) return;
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), redirect: "error", signal: AbortSignal.timeout(5000) });
  } catch { /* ignore */ }
}

async function audit(ctx: Ctx, action: string, sessionId: string, detail: Record<string, unknown> = {}) {
  await ctx.supabase.from("audit_log").insert({ user_id: ctx.userId, session_id: sessionId, action, target: null, detail }).then(() => {}, () => {});
}

// ---------- Shares ----------
export const listShares = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idIn).handler(async ({ data, context }) => {
  await ownTask(context, data.id);
  const { data: rows, error } = await context.supabase.from("task_shares").select("id, in_gallery, expires_at, revoked_at, created_at").eq("session_id", data.id).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error("Could not load share links.");
  return (rows ?? []).map((r: any) => ({ ...r, active: shareActive(r) }));
});

export const createShare = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(idIn.extend({ days: z.union([z.literal(1), z.literal(7), z.literal(30)]), gallery: z.boolean(), showRepo: z.boolean() }))
  .handler(async ({ data, context }) => {
    const s = await ownTask(context, data.id);
    const token = newToken();
    const snapshot = buildSnapshot(s.title, s.messages, data.showRepo ? s.repo : null);
    const expires = new Date(Date.now() + data.days * 86400_000).toISOString();
    const { error } = await context.supabase.from("task_shares").insert({ session_id: s.id, user_id: context.userId, token_hash: await hashToken(token), snapshot, in_gallery: data.gallery, expires_at: expires });
    if (error) throw new Error("Could not create share link.");
    await audit(context, "share.created", s.id, { days: data.days, gallery: data.gallery });
    await notify(context, `Forge: shared "${s.title}" for ${data.days} day(s).`);
    return { token };
  });

export const revokeShare = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ shareId: z.string().uuid() })).handler(async ({ data, context }) => {
  const { data: row, error } = await context.supabase.from("task_shares").update({ revoked_at: new Date().toISOString() }).eq("id", data.shareId).eq("user_id", context.userId).select("session_id").single();
  if (error || !row) throw new Error("Could not revoke link.");
  await audit(context, "share.revoked", row.session_id);
  return { ok: true };
});

/** Public, read-only: resolves only an unexpired, unrevoked token and returns its frozen snapshot. */
export const getPublicShare = createServerFn({ method: "GET" }).inputValidator(z.object({ token: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/) })).handler(async ({ data }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin.from("task_shares").select("snapshot, expires_at, revoked_at, created_at").eq("token_hash", await hashToken(data.token)).maybeSingle();
  if (!row || !shareActive(row)) return null;
  return { snapshot: row.snapshot as ReturnType<typeof buildSnapshot>, created_at: row.created_at, expires_at: row.expires_at };
});

/** Public opt-in gallery: titles and first request only. Tokens are never exposed; entries link nowhere private. */
export const getGallery = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("task_shares").select("id, snapshot, created_at, expires_at, revoked_at").eq("in_gallery", true).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(48);
  return (data ?? []).map((r) => { const s = r.snapshot as ReturnType<typeof buildSnapshot>; return { id: r.id, title: s.title, prompt: s.prompts[0]?.slice(0, 280) ?? "", reply: s.reply.slice(0, 400), created_at: r.created_at }; });
});

// ---------- Reviews ----------
export const getReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idIn).handler(async ({ data, context }) => {
  await ownTask(context, data.id);
  const [{ data: reviews }, { data: events }] = await Promise.all([
    context.supabase.from("change_reviews").select("id, verdict, note, created_at").eq("session_id", data.id).order("created_at", { ascending: false }).limit(10),
    context.supabase.from("agent_events").select("seq, run_id, type, payload, created_at").eq("session_id", data.id).eq("user_id", context.userId).in("type", ["budget.check", "policy.check"]).order("created_at", { ascending: false }).limit(10),
  ]);
  const history = verificationHistory((events ?? []).map((e: any) => ({ ...e, id: `${e.run_id}:${e.seq}` })) as VerificationEvent[]);
  return { reviews: reviews ?? [], badges: reviewBadges(reviews?.[0]?.verdict ?? null, history) };
});

export const submitReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(idIn.extend({ verdict: z.enum(["approved", "changes_requested"]), note: z.string().max(2000) }))
  .handler(async ({ data, context }) => {
    const s = await ownTask(context, data.id);
    const { error } = await context.supabase.from("change_reviews").insert({ session_id: s.id, user_id: context.userId, verdict: data.verdict, note: data.note.trim() });
    if (error) throw new Error("Could not save review.");
    await audit(context, `review.${data.verdict}`, s.id);
    await notify(context, `Forge review on "${s.title}": ${data.verdict === "approved" ? "approved ✅" : "changes requested ✏️"}${data.note.trim() ? ` — ${data.note.trim().slice(0, 300)}` : ""}`);
    return { ok: true };
  });

// ---------- Notifications ----------
export const getNotifySettings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data } = await context.supabase.from("notification_settings").select("webhook_url").eq("user_id", context.userId).maybeSingle();
  const url = (data?.webhook_url as string | null) ?? null;
  return { configured: !!url, host: url ? new URL(url).hostname : null };
});

export const saveNotifySettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ url: z.string().max(500).nullable(), test: z.boolean().default(false) }))
  .handler(async ({ data, context }) => {
    if (data.url && !validWebhook(data.url)) throw new Error("Use a Slack (hooks.slack.com) or Microsoft Teams incoming webhook URL.");
    const { error } = await context.supabase.from("notification_settings").upsert({ user_id: context.userId, webhook_url: data.url, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not save notification settings.");
    if (data.url && data.test) await notify(context, "Forge notifications are connected 🎉");
    return { ok: true };
  });

// ---------- Budget CI gate ----------
/** Owner-clicked: commits the budget CI gate (and a starter budget.json when none exists) to this task's branch only. */
export const installBudgetGate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(idIn.extend({ root: z.string().max(200).regex(/^[\w./-]*$/).refine((r) => !r.includes("..")).default(".") }))
  .handler(async ({ data, context }) => {
    const { data: s, error } = await context.supabase.from("agent_sessions").select("id, repo, work_branch, accounts, running").eq("id", data.id).eq("user_id", context.userId).single();
    if (error || !s) throw new Error("Task not found");
    if (s.running) throw new Error("Wait until the build finishes.");
    const { accountToken } = await import("./accounts.server");
    const key = await accountToken(context.supabase, context.userId, "github", s.accounts);
    if (!key) throw new Error("Connect this task's GitHub account first.");
    const { GitHub } = await import("./github.server");
    const { budgetCheckScript, budgetWorkflow, BUDGET_SCRIPT_PATH, BUDGET_WORKFLOW_PATH } = await import("./budget-ci");
    const gh = new GitHub(key);
    const root = data.root.replace(/^\.\/?|\/$/g, "");
    const budgetPath = root ? `${root}/budget.json` : "budget.json";
    const files: string[] = [];
    await gh.putFile(s.repo, s.work_branch, BUDGET_SCRIPT_PATH, budgetCheckScript(), "ci: add Forge performance budget check"); files.push(BUDGET_SCRIPT_PATH);
    await gh.putFile(s.repo, s.work_branch, BUDGET_WORKFLOW_PATH, budgetWorkflow(root || "."), "ci: enforce budget.json on pull requests"); files.push(BUDGET_WORKFLOW_PATH);
    if (!(await gh.getFile(s.repo, s.work_branch, budgetPath))) {
      await gh.putFile(s.repo, s.work_branch, budgetPath, JSON.stringify({ lcpMs: 2500, cls: 0.1, jsKb: 300, totalKb: 400 }, null, 2) + "\n", "chore: add starter performance budget");
      files.push(budgetPath);
    }
    await audit(context, "budget_gate.installed", s.id, { files, branch: s.work_branch });
    return { files, branch: s.work_branch };
  });
