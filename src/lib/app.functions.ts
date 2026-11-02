import { cleanAccounts } from "./accounts";
import { AUTONOMY, type Autonomy } from "@/lib/engine/autonomy";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Credential, ChatMessage, PendingChange } from "./providers";
import { inspectSkillText, skillUsable, type SkillRegistry } from "./free-skills";

type Ctx = { supabase: any; userId: string };

async function loadSecret(ctx: Ctx, id: string) {
  const { data, error } = await ctx.supabase.from("provider_credentials").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Credential not found");
  const { decryptSecret } = await import("./crypto.server");
  return { row: data, key: await decryptSecret(data.ciphertext, data.iv) };
}

/** GitHub client for the task's chosen account (accounts.github) or, without one, the newest saved token. */
async function github(ctx: Ctx, accounts?: unknown) {
  const { accountToken } = await import("./accounts.server");
  const key = await accountToken(ctx.supabase, ctx.userId, "github", accounts);
  if (!key) throw new Error("Add a GitHub token in Settings first");
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
    let label = data.label;
    if (data.provider === "github") {
      const { GitHub } = await import("./github.server");
      await new GitHub(data.key).user();
    } else if (data.provider === "supabase" || data.provider === "vercel") {
      // Identify the real account behind the token; a second token for the same account is refused.
      const { identifySaved, serviceClient } = await import("./account-identity.server");
      const { identityLabel, sameAccount, duplicateTokenMessage } = await import("./account-identity");
      const identity = await serviceClient(data.provider, data.key).identity();
      const dup = sameAccount(await identifySaved(context.supabase, context.userId, data.provider), identity);
      if (dup) throw new Error(duplicateTokenMessage(data.provider, identity, dup.last4));
      label = identityLabel(data.provider, data.label, identity);
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
    const { error, data: saved } = await context.supabase.from("provider_credentials").insert({
      provider: data.provider,
      label,
      base_url: data.base_url,
      custom_models: data.custom_models,
      extra_body: (data.extra_body ?? null) as never,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      last4: data.key.slice(-4),
      user_id: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: saved.id as string };
  });

export const deleteCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("provider_credentials").select("*").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (row?.auth_method === "oauth") { const { revokeOAuthAccount } = await import("./deploy-oauth.server"); await revokeOAuthAccount(row); }
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

/** Uses the caller's own AI key to divide a task into master/explorer/coder/tester work. */
export const splitWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ credential_id: z.string().uuid(), model: z.string().min(1).max(200), task: z.string().min(10).max(20_000), repo: z.string().max(200).optional() }))
  .handler(async ({ data, context }) => {
    const { row, key } = await loadSecret(context, data.credential_id);
    const { createModel } = await import("./providers.server");
    const { SPLIT_SYSTEM, parseWorkSplit } = await import("./work-split");
    const { streamText } = await import("ai");
    try {
      const result = streamText({
        model: createModel(row.provider, key, row.base_url, data.model, row.extra_body),
        system: SPLIT_SYSTEM,
        prompt: `${data.repo ? `Repository: ${data.repo}\n` : ""}Task:\n${data.task}`,
        maxRetries: 1,
      });
      return parseWorkSplit(await result.text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Planning failed";
      throw new Error(msg.slice(0, 300));
    }
  });

// ---------- GitHub ----------
export const listRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ account: z.string().uuid().optional() }).default({}))
  .handler(async ({ data, context }) => (await github(context, { github: data.account })).repos());

export const listBranches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ repo: z.string(), account: z.string().uuid().optional() }))
  .handler(async ({ data, context }) => (await github(context, { github: data.account })).branches(data.repo));

export const createRepo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
      description: z.string().max(300).default(""),
      private: z.boolean(),
      account: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const gh = await github(context, { github: data.account });
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
  accounts?: Record<string, string | null> | null;
  base_branch: string;
  work_branch: string;
  credential_id: string | null;
  model: string;
  mode: Autonomy;
  fallback_model?: string | null;
  reasoning_profile?: string | null;
  coding_model?: string | null;
  reviewer_model?: string | null;
  messages: ChatMessage[];
  pending: PendingChange[];
  updated_at: string;
  running?: boolean;
  stop_requested?: boolean;
  keeper_id?: string | null;
};

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_sessions")
      .select("id, title, repo, work_branch, mode, updated_at, running, keeper_id, pending, supabase_ref, vercel_project_id")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Only the count of waiting changes is needed by the list.
    return (data ?? []).map(({ pending, ...r }: any) => ({ ...r, pendingCount: Array.isArray(pending) ? pending.length : 0 })) as (Pick<SessionRow, "id" | "title" | "repo" | "work_branch" | "mode" | "updated_at" | "running" | "keeper_id"> & { pendingCount: number; supabase_ref: string | null; vercel_project_id: string | null })[];
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
      mode: z.enum(AUTONOMY),
      title: z.string().max(120),
      accounts: z.object({ github: z.string().uuid().optional(), supabase: z.string().uuid().optional(), vercel: z.string().uuid().optional() }).default({}),
    }),
  )
  .handler(async ({ data, context }) => {
    const gh = await github(context, data.accounts);
    const work = `agent/${Date.now().toString(36)}`;
    await gh.createBranch(data.repo, data.base_branch, work);
    // Per-project links carry over: a new task on a repo reuses that repo's last database + Vercel links
    // (and its saved encrypted database settings), so parallel tasks never need re-setup.
    const { data: prev } = await context.supabase.from("agent_sessions")
      .select("id, supabase_ref, vercel_project_id, applied_migrations, accounts")
      .eq("user_id", context.userId).eq("repo", data.repo)
      .or("supabase_ref.not.is.null,vercel_project_id.not.is.null")
      .order("updated_at", { ascending: false }).limit(1);
    const link = prev?.[0];
    const { data: row, error } = await context.supabase
      .from("agent_sessions")
      .insert({
        ...data, work_branch: work, user_id: context.userId,
        ...(link ? { supabase_ref: link.supabase_ref, vercel_project_id: link.vercel_project_id, applied_migrations: link.applied_migrations ?? [] } : {}),
        // Same project = same accounts: inherit the repo's database/Vercel account unless chosen now.
        accounts: { ...cleanAccounts(link?.accounts), ...cleanAccounts(data.accounts) },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (link?.supabase_ref) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: saved } = await supabaseAdmin.from("task_deployment_settings").select("project_ref, ciphertext, iv")
          .eq("task_id", link.id).eq("user_id", context.userId).eq("project_ref", link.supabase_ref).maybeSingle();
        if (saved) await supabaseAdmin.from("task_deployment_settings").upsert({ task_id: row.id, user_id: context.userId, ...saved, updated_at: new Date().toISOString() });
      } catch { /* links still carried; settings can be re-saved in Deploy */ }
    }
    return row.id as string;
  });

export const updateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      credential_id: z.string().uuid().optional(),
      model: z.string().trim().min(1).max(200).optional(),
      mode: z.enum(AUTONOMY).optional(),
      fallback_model: z.string().trim().max(200).nullable().optional(),
      reasoning_profile: z.enum(["auto", "speed", "balanced", "deep"]).optional(),
      coding_model: z.string().trim().max(200).nullable().optional(),
      reviewer_model: z.string().trim().max(200).nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { validateRoleModel } = await import("@/lib/engine/reasoning");
    const patch: { model?: string; mode?: string; credential_id?: string; fallback_model?: string | null; reasoning_profile?: string; coding_model?: string | null; reviewer_model?: string | null } = {};
    if (data.fallback_model !== undefined) patch.fallback_model = data.fallback_model || null;
    if (data.reasoning_profile) patch.reasoning_profile = data.reasoning_profile;
    for (const role of ["coding", "reviewer"] as const) {
      const v = data[`${role}_model`];
      if (v === undefined) continue;
      const err = v ? validateRoleModel(role, v) : null;
      if (err) throw new Error(err);
      patch[`${role}_model`] = v || null;
    }
    if (data.credential_id) {
      if (!data.model) throw new Error("Choose a model for the new provider.");
      // Owner check: RLS only returns the caller's own saved keys.
      const { data: cred } = await context.supabase.from("provider_credentials").select("id").eq("id", data.credential_id).maybeSingle();
      if (!cred) throw new Error("That AI key was not found.");
      patch.credential_id = data.credential_id;
    }
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
    return (await github(context, s.accounts)).tree(s.repo, s.work_branch);
  });

export const readFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), path: z.string() }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    const f = await (await github(context, s.accounts)).getFile(s.repo, s.work_branch, data.path);
    return f?.content ?? null;
  });

/** Raw base64 file for chat downloads/previews of files the agent shared. */
export const readFileRaw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), path: z.string().min(1).max(500) }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    const gh = await github(context, s.accounts);
    const branch = encodeURIComponent(s.work_branch);
    const path = data.path.split("/").map(encodeURIComponent).join("/");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = await gh.req<any>(`repos/${s.repo}/contents/${path}?ref=${branch}`).catch(() => null);
    if (!f || Array.isArray(f)) return null;
    let b64 = String(f.content ?? "").replace(/\s/g, "");
    if (!b64 && f.sha) b64 = String((await gh.req<any>(`repos/${s.repo}/git/blobs/${f.sha}`)).content ?? "").replace(/\s/g, ""); // >1 MB files
    return { data: b64, size: f.size as number };
  });

export const getDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    return (await github(context, s.accounts)).compare(s.repo, s.base_branch, s.work_branch);
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
      const gh = await github(context, s.accounts);
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
    return (await github(context, s.accounts)).openPr(s.repo, s.base_branch, s.work_branch, s.title, "Opened by BYOK coding agent.");
  });

// ---------- Checkpoints & editing ----------
export const restoreCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), sha: z.string().regex(/^[0-9a-f]{40}$/) }))
  .handler(async ({ data, context }) => {
    const s = await session(context, data.id);
    const gh = await github(context, s.accounts);
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
    const sha = await (await github(context, s.accounts)).putFile(s.repo, s.work_branch, data.path, data.content, data.message || `edit ${data.path}`);
    return sha;
  });

// ---------- Skills ----------
export type Skill = { id: string; name: string; instructions: string; enabled: boolean; source: string | null; registry: Partial<SkillRegistry> };
export type SkillCandidate = { path: string; name: string; description: string; chars: number; already: boolean; registry: SkillRegistry };

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("skills").select("id, name, instructions, enabled, source, registry").order("created_at");
    if (error) throw new Error(error.message);
    return data as Skill[];
  });

export const upsertSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ id: z.string().uuid().nullable(), name: z.string().min(1).max(80), instructions: z.string().min(1).max(8000), enabled: z.boolean() }),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = data.id ? await context.supabase.from("skills").select("instructions, source, registry").eq("id", data.id).single() : { data: null };
    const findings = inspectSkillText(data.instructions);
    if (findings.length) throw new Error(`Skill blocked by free-only audit: ${findings.join("; ")}`);
    if (existing?.source && existing.instructions !== data.instructions) throw new Error("Imported instructions are immutable. Re-import to audit a new version, or create an original skill.");
    if (data.enabled && existing?.source && !skillUsable({ ...existing, instructions: data.instructions })) throw new Error("Re-import this skill for a current free-only audit before enabling it.");
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

// ---------- Import skills from another repository ----------
export const previewSkillImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ source: z.string().trim().min(1).max(400) }))
  .handler(async ({ data, context }) => {
    const { parseSkillSource, listSkillCandidates } = await import("./skill-import.server");
    const gh = await githubAny(context);
    const { repo, branch, candidates } = await listSkillCandidates(gh, parseSkillSource(data.source));
    const { data: own } = await context.supabase.from("skills").select("name").eq("user_id", context.userId);
    const have = new Set((own ?? []).map((s: { name: string }) => s.name));
    return {
      repo,
      branch,
      candidates: candidates.map((c) => ({
        path: c.path,
        name: c.name,
        description: c.description,
        chars: c.chars,
        already: have.has(c.name),
        registry: c.registry,
      })) as SkillCandidate[],
    };
  });

export const importSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ source: z.string().trim().min(1).max(400), paths: z.array(z.string().min(1).max(500)).min(1).max(40) }),
  )
  .handler(async ({ data, context }) => {
    const { parseSkillSource, listSkillCandidates } = await import("./skill-import.server");
    const gh = await githubAny(context);
    const { repo, branch, candidates } = await listSkillCandidates(gh, parseSkillSource(data.source));
    const chosen = candidates.filter((c) => data.paths.includes(c.path));
    if (!chosen.length) throw new Error("Those files are no longer in that repository");
    if (chosen.length !== new Set(data.paths).size) throw new Error("Some selected paths are no longer available. Search again.");
    const blocked = chosen.find((c) => c.registry.verificationStatus !== "verified");
    if (blocked) throw new Error(`${blocked.name} blocked: ${blocked.registry.findings.join("; ")}`);
    const { data: own } = await context.supabase.from("skills").select("name").eq("user_id", context.userId);
    const have = new Set((own ?? []).map((s: { name: string }) => s.name));
    const added: string[] = [];
    const skipped: string[] = [];
    for (const c of chosen) {
      if (have.has(c.name)) {
        skipped.push(c.name);
        continue;
      }
      have.add(c.name);
      const { error } = await context.supabase
        .from("skills")
        .insert({ user_id: context.userId, name: c.name, instructions: c.instructions, enabled: true, source: `${repo}@${c.registry.version}:${c.path}`, registry: c.registry });
      if (error) throw new Error(error.message);
      added.push(c.name);
    }
    return { added, skipped };
  });

export const rollbackSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: revision, error } = await context.supabase.from("skill_revisions").select("name, instructions, source, registry").eq("skill_id", data.id).eq("user_id", context.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !revision) throw new Error("No previous revision available");
    // Rollbacks are disabled until deliberately re-enabled/re-audited.
    const { error: updateError } = await context.supabase.from("skills").update({ ...revision, enabled: false }).eq("id", data.id).eq("user_id", context.userId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

// ---------- Sandbox terminal ----------
export const runTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), command: z.string().trim().min(1).max(4000) }))
  .handler(async ({ data, context }) => {
    const { data: s, error } = await context.supabase.from("agent_sessions").select("*").eq("id", data.id).eq("user_id", context.userId).single();
    if (error || !s) throw new Error("Task not found");
    const { accountToken } = await import("./accounts.server");
    const key = await accountToken(context.supabase, context.userId, "github", s.accounts);
    if (!key) throw new Error("Add a GitHub token in Settings first");
    const { runInSandbox } = await import("./sandbox.server");
    return runInSandbox(context.supabase, s, key, data.command, (s.pending as PendingChange[]) ?? []);
  });

/** Starts a terminal command detached in the sandbox; poll output with pollTerminal. */
export const startTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), command: z.string().trim().min(1).max(4000) }))
  .handler(async ({ data, context }) => {
    const { data: s, error } = await context.supabase.from("agent_sessions").select("*").eq("id", data.id).eq("user_id", context.userId).single();
    if (error || !s) throw new Error("Task not found");
    const { accountToken } = await import("./accounts.server");
    const key = await accountToken(context.supabase, context.userId, "github", s.accounts);
    if (!key) throw new Error("Add a GitHub token in Settings first");
    const { runInSandbox } = await import("./sandbox.server");
    const job = crypto.randomUUID();
    const r = await runInSandbox(context.supabase, s, key, data.command, (s.pending as PendingChange[]) ?? [], undefined, undefined, job);
    return { job: (r as { job: string }).job };
  });

export const pollTerminal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), job: z.string().uuid(), offset: z.number().int().min(0), kill: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase.from("agent_sessions").select("sandbox_id").eq("id", data.id).eq("user_id", context.userId).single();
    if (!s?.sandbox_id) return { out: "", offset: data.offset, exit_code: -1, done: true, note: "Sandbox is no longer running. Run the command again." };
    const { pollJob } = await import("./sandbox.server");
    return pollJob(s.sandbox_id, data.job, data.offset, data.kill);
  });


export const suggestCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), request: z.string().trim().min(2).max(4000), cwd: z.string().max(500).optional(), history: z.array(z.string().max(500)).max(10).optional() }))
  .handler(async ({ data, context }) => {
    const { data: s, error } = await context.supabase.from("agent_sessions").select("credential_id, model, repo").eq("id", data.id).eq("user_id", context.userId).single();
    if (error || !s) throw new Error("Task not found");
    if (!s.credential_id) throw new Error("Pick an AI key for this task first");
    const { row, key } = await loadSecret(context, s.credential_id ?? "");
    const { createModel } = await import("./providers.server");
    const { COMMAND_SYSTEM, parseCommandReply } = await import("./terminal");
    const { streamText } = await import("ai");
    try {
      const result = streamText({
        model: createModel(row.provider, key, row.base_url, s.model, row.extra_body),
        system: COMMAND_SYSTEM,
        prompt: `Repository: ${s.repo}\nWorking directory: ${data.cwd || "repo root"}\nRecent commands:\n${(data.history ?? []).join("\n") || "(none)"}\n\nRequest: ${data.request}`,
        maxRetries: 1,
      });
      return parseCommandReply(await result.text);
    } catch (e) {
      throw new Error((e instanceof Error ? e.message : "Could not create a command").slice(0, 300));
    }
  });

export const stopSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { stopAgentSession } = await import("./session-stop.server");
    return stopAgentSession(context.supabase, data.id, context.userId);
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
