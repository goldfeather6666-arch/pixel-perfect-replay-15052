import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Latest run of a task with its stage history, skills, errors and metrics (owner-scoped by RLS). */
export const getRunOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sessionId: z.string().uuid(), runId: z.string().uuid().optional() }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: runs, error } = await sb.from("agent_runs")
      .select("id, stage, objective, model, autonomy, trace_id, outcome, metrics, started_at, ended_at, next_seq")
      .eq("session_id", data.sessionId).order("started_at", { ascending: false }).limit(10);
    if (error) throw new Error("Could not load run history");
    const run = (data.runId ? runs?.find((r) => r.id === data.runId) : runs?.[0]) ?? null;
    if (!run) return { run: null, runs: [], transitions: [], skills: [], errors: [], mcp: [] };
    const [transitions, skills, errors, mcp] = await Promise.all([
      sb.from("agent_run_transitions").select("from_stage, to_stage, reason, created_at").eq("run_id", run.id).order("id"),
      sb.from("skill_executions").select("skill_name, version_hash, status, reason").eq("run_id", run.id).order("created_at"),
      sb.from("agent_error_logs").select("category, service, message, retryable, created_at").eq("run_id", run.id).order("created_at", { ascending: false }).limit(50),
      sb.from("mcp_execution_logs").select("server_name, tool_name, decision, ok, duration_ms, created_at").eq("run_id", run.id).order("created_at", { ascending: false }).limit(50),
    ]);
    return {
      run, runs: (runs ?? []).map((r) => ({ id: r.id, stage: r.stage, started_at: r.started_at, objective: r.objective.slice(0, 80) })),
      transitions: transitions.data ?? [], skills: skills.data ?? [], errors: errors.data ?? [], mcp: mcp.data ?? [],
    };
  });

/** Replay cursor: events after `afterSeq`, in order, paginated. Duplicates are impossible (run_id+seq key). */
export const getRunEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ runId: z.string().uuid(), afterSeq: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(200).default(200) }))
  .handler(async ({ data, context }) => {
    const { data: ownedRun } = await context.supabase.from("agent_runs")
      .select("id").eq("id", data.runId).eq("user_id", context.userId).maybeSingle();
    if (!ownedRun) throw new Error("Run not found");
    const { data: rows, error } = await context.supabase.from("agent_events")
      .select("seq, type, payload, created_at").eq("run_id", data.runId).eq("user_id", context.userId)
      .gt("seq", data.afterSeq).order("seq").limit(data.limit);
    if (error) throw new Error("Could not load run events");
    return { events: rows ?? [], hasMore: (rows?.length ?? 0) === data.limit };
  });

export const searchErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ query: z.string().max(100).default(""), category: z.string().max(40).optional() }))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("agent_error_logs").select("category, service, message, created_at, session_id").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50);
    if (data.category) q = q.eq("category", data.category);
    if (data.query.trim()) q = q.ilike("message", `%${data.query.trim().replace(/[%_]/g, "")}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error("Could not search errors");
    return rows ?? [];
  });

export const listMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ repo: z.string().min(1).max(200) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("project_memories").select("id, category, content, updated_at").eq("user_id", context.userId).eq("repo", data.repo).order("updated_at", { ascending: false }).limit(100);
    if (error) throw new Error("Could not load memories");
    return rows ?? [];
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_memories").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error("Could not delete memory");
    return { ok: true };
  });

export const addMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ repo: z.string().min(1).max(200), category: z.enum(["project", "preference", "decision", "error"]), content: z.string().trim().min(3).max(2000) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_memories").insert({ user_id: context.userId, repo: data.repo, category: data.category, content: data.content, source: "user" });
    if (error) throw new Error("Could not save memory");
    return { ok: true };
  });
