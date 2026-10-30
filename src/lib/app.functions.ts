import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Credential, ChatMessage, PendingChange } from "./providers";

type Ctx = { supabase: any; userId: string };

async function loadSecret(ctx: Ctx, id: string) {
  const { data, error } = await ctx.supabase.from("provider_credentials").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Credential not found");
  const { decryptSecret } = await import("./crypto.server");
  return { row: data, key: await decryptSecret(data.ciphertext, data.iv) };
}

async function github(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("provider_credentials")
    .select("id")
    .eq("provider", "github")
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data?.length) throw new Error("Add a GitHub token in Settings first");
  const { key } = await loadSecret(ctx, data[0].id);
  const { GitHub } = await import("./github.server");
  return new GitHub(key);
}

/** Like github(), but falls back to anonymous reads so public repos still work without a token. */
async function githubAny(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("provider_credentials")
    .select("id")
    .eq("provider", "github")
    .order("created_at", { ascending: false })
    .limit(1);
  const { GitHub } = await import("./github.server");
  if (!data?.length) return new GitHub("");
  const { key } = await loadSecret(ctx, data[0].id);
  return new GitHub(key);
}

// ---------- Credentials ----------
export const listCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("provider_credentials")
      .select("id, provider, label, base_url, last4, created_at, custom_models, extra_body")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as unknown as Credential[];
  });

export const saveCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      provider: z.enum(["openai", "anthropic", "google", "openrouter", "compatible", "github", "supabase", "vercel"]),
      label: z.string().max(80),
      key: z.string().min(1).max(4000),
      base_url: z.string().url().nullable(),
      custom_models: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
      extra_body: z.record(z.string(), z.unknown()).nullable().default(null),
    }),
  )
  .handler(async ({ data, context }) => {
    // Validate with a real provider request before storing.
    if (data.provider === "github") {
      const { GitHub } = await import("./github.server");
      await new GitHub(data.key).user();
    } else if (data.provider === "supabase") {
      const { SupabaseMgmt } = await import("./integrations.server");
      await new SupabaseMgmt(data.key).projects();
    } else if (data.provider === "vercel") {
      const { Vercel } = await import("./integrations.server");
      await new Vercel(data.key).user();
    } else {
      const { listProviderModels } = await import("./providers.server");
      const { pingChat } = await import("./providers.server");
      try {
        await listProviderModels(data.provider, data.key, data.base_url);
      } catch (e) {
        // Some compatible endpoints have no /models list: verify with a tiny chat call instead.
        if (data.provider !== "compatible" || !data.base_url || !data.custom_models[0]) throw e;
        await pingChat(data.base_url, data.key, data.custom_models[0], data.extra_body);
      }
    }
    const { encryptSecret } = await import("./crypto.server");
    const enc = await encryptSecret(data.key);
    const { error } = await context.supabase.from("provider_credentials").insert({
      provider: data.provider,
      label: data.label,
      base_url: data.base_url,
      custom_models: data.custom_models,
      extra_body: (data.extra_body ?? null) as never,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      last4: data.key.slice(-4),
      user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("provider_credentials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { row, key } = await loadSecret(context, data.id);
    const { listProviderModels } = await import("./providers.server");
    return listProviderModels(row.provider, key, row.base_url, row.custom_models ?? []);
  });

// ---------- GitHub ----------
export const listRepos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await github(context)).repos());

export const listBranches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ repo: z.string() }))
  .handler(async ({ data, context }) => (await github(context)).branches(data.repo));

export const createRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
      description: z.string().max(300).default(""),
      private: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const gh = await github(context);
    const r = await gh.createRepo(data.name, data.description, data.private);
    // GitHub initialises the first commit asynchronously; wait until the branch exists.
    for (let i = 0; i < 10; i++) {
      try { if ((await gh.branches(r.full_name)).includes(r.default_branch)) break; } catch {}
      await new Promise((res) => setTimeout(res, 800));
    }
    return r;
  });

// ---------- Sessions ----------
export type SessionRow = {
  id: string;
  title: string;
  repo: string;
  base_branch: string;
  work_branch: string;
  credential_id: string | null;
  model: string;
  mode: "supervised" | "autonomous";
  messages: ChatMessage[];
  pending: PendingChange[];
  updated_at: string;
};

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_sessions")
      .select("id, title, repo, work_branch, mode, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as Pick<SessionRow, "id" | "title" | "repo" | "work_branch" | "mode" | "updated_at">[];
  });

export const getSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("agent_sessions").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return row as unknown as SessionRow;
  });

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      repo: z.string(),
      base_branch: z.string(),
      credential_id: z.string().uuid(),
      model: z.string().min(1),
      mode: z.enum(["supervised", "autonomous"]),
      title: z.string().max(120),
    }),
  )
  .handler(async ({ data, context }) => {
    const gh = await github(context);
    const work = `agent/${Date.now().toString(36)}`;
    await gh.createBranch(data.repo, data.base_branch, work);
    const { data: row, error } = await context.supabase
      .from("agent_sessions")
      .insert({ ...data, work_branch: work, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row.id as string;
  });

export const updateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ id: z.string().uuid(), model: z.string().optional(), mode: z.enum(["supervised", "autonomous"]).optional() }),
  )
  .handler(async ({ data, context }) => {
    const patch: { model?: string; mode?: string } = {};
    if (data.model) patch.model = data.model;
    if (data.mode) patch.mode = data.mode;
    const { id } = data;
    const { error } = await context.supabase.from("agent_sessions").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agent_sessions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Workspace ----------
async function session(context: Ctx, id: string) {
  const { data, error } = await context.supabase.from("agent_sessions").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as unknown as SessionRow;
}

export const getTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    return (await github(context)).tree(s.repo, s.work_branch);
  });

export const readFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), path: z.string() }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    const f = await (await github(context)).getFile(s.repo, s.work_branch, data.path);
    return f?.content ?? null;
  });

export const getDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    return (await github(context)).compare(s.repo, s.base_branch, s.work_branch);
  });

export const resolvePending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), approve: z.boolean(), message: z.string().max(200).optional(), paths: z.array(z.string()).max(500).optional() }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    const results: string[] = [];
    const chosen = data.paths ? s.pending.filter((c: { path: string }) => data.paths!.includes(c.path)) : s.pending;
    const rest = data.paths ? s.pending.filter((c: { path: string }) => !data.paths!.includes(c.path)) : [];
    if (data.approve) {
      const gh = await github(context);
      for (const c of chosen) {
        const msg = data.message || `agent: ${c.action} ${c.path}`;
        if (c.action === "write") await gh.putFile(s.repo, s.work_branch, c.path, c.content ?? "", msg);
        else await gh.deleteFile(s.repo, s.work_branch, c.path, msg);
        results.push(c.path);
      }
    }
    const { error } = await context.supabase.from("agent_sessions").update({ pending: rest }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { committed: results, remaining: rest };
  });

export const openPullRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    return (await github(context)).openPr(s.repo, s.base_branch, s.work_branch, s.title, "Opened by BYOK coding agent.");
  });

// ---------- Checkpoints & editing ----------
export const restoreCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), sha: z.string().regex(/^[0-9a-f]{40}$/) }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    const gh = await github(context);
    const c = await gh.compare(s.repo, s.base_branch, s.work_branch);
    // Only allow rewinding to the branch's base or one of its own agent commits.
    if (data.sha !== c.base_sha && !c.commits.some((x) => x.sha === data.sha)) throw new Error("Not a checkpoint of this task");
    await gh.resetBranch(s.repo, s.work_branch, data.sha);
    return { ok: true };
  });

export const saveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), path: z.string().min(1), content: z.string(), message: z.string().max(200) }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    const sha = await (await github(context)).putFile(s.repo, s.work_branch, data.path, data.content, data.message || `edit ${data.path}`);
    return sha;
  });

// ---------- Skills ----------
export type Skill = { id: string; name: string; instructions: string; enabled: boolean };

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("skills").select("id, name, instructions, enabled").order("created_at");
    if (error) throw new Error(error.message);
    return data as Skill[];
  });

export const upsertSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ id: z.string().uuid().nullable(), name: z.string().min(1).max(80), instructions: z.string().min(1).max(8000), enabled: z.boolean() }),
  )
  .handler(async ({ data, context }) => {
    const row = { name: data.name, instructions: data.instructions, enabled: data.enabled };
    const { error } = data.id
      ? await context.supabase.from("skills").update(row).eq("id", data.id)
      : await context.supabase.from("skills").insert({ ...row, user_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("skills").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Sandbox terminal ----------
export const runTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), command: z.string().trim().min(1).max(4000) }))
  .handler(async ({ data, context }) => {
    const { data: s, error } = await context.supabase.from("agent_sessions").select("*").eq("id", data.id).eq("user_id", context.userId).single();
    if (error || !s) throw new Error("Task not found");
    const { data: gh } = await context.supabase.from("provider_credentials").select("id").eq("provider", "github").order("created_at", { ascending: false }).limit(1);
    if (!gh?.length) throw new Error("Add a GitHub token in Settings first");
    const { key } = await loadSecret(context, gh[0]!.id);
    const { runInSandbox } = await import("./sandbox.server");
    return runInSandbox(context.supabase, s, key, data.command, (s.pending as PendingChange[]) ?? []);
  });

export const stopSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agent_sessions").update({ stop_requested: true }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getRepoMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ repo: z.string().min(3).max(200) }))
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase.from("repo_memory").select("notes, updated_at").eq("user_id", context.userId).eq("repo", data.repo).maybeSingle();
    return m ?? null;
  });

export const clearRepoMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ repo: z.string().min(3).max(200) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("repo_memory").delete().eq("user_id", context.userId).eq("repo", data.repo);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
