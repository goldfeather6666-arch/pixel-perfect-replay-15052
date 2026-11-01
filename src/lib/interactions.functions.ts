import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { answerInput, describeAnswer, SUGGESTION_DECISIONS, validateAnswer, type QuestionInput } from "@/lib/engine/discovery";

export type TaskQuestion = QuestionInput & { id: string; run_id: string | null; status: string; answer: Json | null; created_at: string };
export type TaskSuggestion = { id: string; title: string; description: string; requested_approach: string; recommended_approach: string; rationale: string; expected_benefit: string[]; complexity: string; risk: string; estimated_impact: string; status: string; created_at: string };

/** Questions, suggestions and the latest specification of one task (owner-only via RLS). */
export const listInteractions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sessionId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: ownedSession } = await sb.from("agent_sessions").select("id").eq("id", data.sessionId).eq("user_id", context.userId).maybeSingle();
    if (!ownedSession) throw new Error("Task not found");
    const [q, sg, sp] = await Promise.all([
      sb.from("task_questions").select("*").eq("session_id", data.sessionId).eq("user_id", context.userId).order("created_at").order("position").limit(100),
      sb.from("task_suggestions").select("*").eq("session_id", data.sessionId).eq("user_id", context.userId).order("created_at").limit(50),
      sb.from("task_specifications").select("version, task_class, spec, created_at").eq("session_id", data.sessionId).eq("user_id", context.userId).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (q.error) throw new Error(q.error.message);
    return { questions: (q.data ?? []) as unknown as TaskQuestion[], suggestions: (sg.data ?? []) as unknown as TaskSuggestion[], spec: sp.data ?? null };
  });

/**
 * Validates the answer against the stored question, then saves it atomically. Only the call that
 * closes the run's last open required question gets a resume message, so duplicates cannot resume twice.
 */
export const answerQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ questionId: z.string().uuid(), key: z.string().min(8).max(80), answer: answerInput }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: q } = await sb.from("task_questions").select("*").eq("id", data.questionId).eq("user_id", context.userId).maybeSingle();
    if (!q) throw new Error("Question not found.");
    if (q.status !== "open") return { changed: false, resume: null as string | null, remaining: 0 };
    const err = validateAnswer(q as never, data.answer);
    if (err) throw new Error(err);
    const { data: res, error } = await sb.rpc("answer_task_question", { _question: data.questionId, _answer: data.answer, _key: data.key, _skip: data.answer.skip });
    if (error) throw new Error(error.message);
    const r = res as { changed: boolean; remaining: number; resume: boolean };
    let resume: string | null = null;
    if (r.resume) {
      const { data: all } = await sb.from("task_questions").select("*").eq("session_id", q.session_id).filter("run_id", q.run_id ? "eq" : "is", q.run_id ?? null).in("status", ["answered", "skipped"]).order("position");
      const lines = (all ?? []).map((x) => `- ${describeAnswer(x as never, (x.answer ?? {}) as never)}`);
      resume = `Here are my answers to your questions:\n${lines.join("\n")}\n\nUpdate the task specification if needed, then continue the work from where you paused.`;
    }
    return { changed: r.changed, resume, remaining: r.remaining };
  });

export const decideSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), decision: z.enum(SUGGESTION_DECISIONS) }))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("decide_task_suggestion", {
      _suggestion: data.id,
      _decision: data.decision,
    });
    if (error) throw new Error(error.message);
    const row = result as { changed: boolean; title: string; recommended_approach: string; decision?: string };
    if (!row?.changed) return { message: null as string | null };
    const message = data.decision === "accepted" ? `I accept your suggestion “${row.title}”: use ${row.recommended_approach}. Update the plan/spec accordingly and continue.`
      : data.decision === "discussed" ? `Let's discuss your suggestion “${row.title}” before deciding. Explain the trade-offs for my project briefly; don't change scope yet.`
      : null;
    return { message };
  });
