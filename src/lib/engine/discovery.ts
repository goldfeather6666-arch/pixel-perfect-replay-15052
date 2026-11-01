// Requirements intelligence: task classification, question/suggestion contracts and answer
// validation. Pure so the server, UI and tests share one definition.
import { z } from "zod";

export const TASK_CLASSES = ["small", "medium", "large", "high_risk"] as const;
export type TaskClass = (typeof TASK_CLASSES)[number];

const HIGH_RISK = /\b(auth(entication|orization)?|login|password|billing|payment|stripe|paddle|checkout|subscription|secret|api key|token|permission|rls|role|admin|drop (table|column)|delete (all|every)|truncate|destructive|migrat(e|ion) (data|production)|production (release|deploy)|go live)\b/i;
const LARGE = /\b(saas|platform|full[- ]?stack|end[- ]to[- ]end|dashboard|marketplace|multi[- ]tenant|from scratch|whole (app|site)|entire (app|site)|redesign|re-?architect|rewrite|database schema|integrat(e|ion) with|realtime|several (pages|features))\b/i;
const SMALL = /\b(typo|rename|copy|text|label|color|colour|spacing|padding|one[- ]line|small fix|tweak|bump|fix (the|a) (bug|error|crash)|change the (title|heading|button))\b/i;

/** Rule-based, explainable classification; signals tell the user why. */
export function classifyTask(message: string): { taskClass: TaskClass; signals: string[] } {
  const text = message.trim();
  const signals: string[] = [];
  const risk = text.match(HIGH_RISK);
  if (risk) signals.push(`touches a sensitive area (“${risk[0]}”)`);
  const large = text.match(LARGE);
  if (large) signals.push(`broad scope (“${large[0]}”)`);
  const bullets = (text.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) ?? []).length;
  if (bullets >= 6) signals.push(`${bullets} listed requirements`);
  if (text.length > 1500) signals.push("long brief");
  if (risk) return { taskClass: "high_risk", signals };
  if (large || bullets >= 6 || text.length > 1500) return { taskClass: "large", signals };
  const small = text.match(SMALL);
  if (small && text.length < 400) return { taskClass: "small", signals: [`contained change (“${small[0]}”)`] };
  if (text.length < 160 && bullets < 2) return { taskClass: "small", signals: ["short, specific request"] };
  return { taskClass: "medium", signals: signals.length ? signals : ["contained feature or fix across a few files"] };
}

/** Question budget per class: simple work proceeds without an interview. */
export function questionBudget(c: TaskClass): number {
  return c === "small" ? 0 : c === "medium" ? 2 : 5;
}

export const QUESTION_TYPES = ["single_select", "multi_select", "text", "confirmation"] as const;
const optionSchema = z.object({ id: z.string().min(1).max(60), label: z.string().min(1).max(120), description: z.string().max(300).default("") });
export const questionInput = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(600).default(""),
  type: z.enum(QUESTION_TYPES),
  required: z.boolean().default(true),
  options: z.array(optionSchema).max(6).default([]),
  recommended_option_ids: z.array(z.string()).max(6).default([]),
  recommendation_reason: z.string().max(400).default(""),
  safe_default: z.string().max(200).nullable().default(null),
  allow_custom_answer: z.boolean().default(false),
  allow_skip: z.boolean().default(false),
}).superRefine((q, ctx) => {
  const ids = new Set(q.options.map((o) => o.id));
  if ((q.type === "single_select" || q.type === "multi_select") && q.options.length < 2) ctx.addIssue({ code: "custom", message: "Select questions need at least two options" });
  if (ids.size !== q.options.length) ctx.addIssue({ code: "custom", message: "Option ids must be unique" });
  for (const r of q.recommended_option_ids) if (!ids.has(r)) ctx.addIssue({ code: "custom", message: `Recommended option ${r} does not exist` });
  if (q.type === "single_select" && q.recommended_option_ids.length > 1) ctx.addIssue({ code: "custom", message: "Single-select questions recommend at most one option" });
  if (q.required && q.allow_skip && !q.safe_default) ctx.addIssue({ code: "custom", message: "A required question may allow skipping only with a safe default" });
});
export type QuestionInput = z.infer<typeof questionInput>;
export const askInput = z.object({ questions: z.array(questionInput).min(1).max(5) });

/** Drops questions already answered in this task (same normalized title) and enforces the class budget. */
export function filterQuestions(qs: QuestionInput[], answeredTitles: string[], c: TaskClass): { keep: QuestionInput[]; dropped: string[] } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const seen = new Set(answeredTitles.map(norm));
  const keep: QuestionInput[] = [];
  const dropped: string[] = [];
  const budget = Math.max(1, questionBudget(c));
  for (const q of qs) {
    const n = norm(q.title);
    if (seen.has(n)) { dropped.push(`${q.title} (already answered)`); continue; }
    if (keep.length >= budget) { dropped.push(`${q.title} (over the ${budget}-question limit for a ${c.replace("_", "-")} task)`); continue; }
    seen.add(n);
    keep.push(q);
  }
  return { keep, dropped };
}

export type StoredQuestion = QuestionInput & { id: string };
export const answerInput = z.object({
  option_ids: z.array(z.string().max(60)).max(6).default([]),
  text: z.string().max(4000).default(""),
  skip: z.boolean().default(false),
});
export type AnswerInput = z.infer<typeof answerInput>;

/** Validates an answer against the exact stored question. Returns an error string or null. */
export function validateAnswer(q: Pick<StoredQuestion, "type" | "options" | "required" | "allow_custom_answer" | "allow_skip">, a: AnswerInput): string | null {
  if (a.skip) {
    if (!q.allow_skip) return "This question cannot be skipped.";
    if (a.option_ids.length || a.text.trim()) return "A skipped answer cannot include a selection or custom text.";
    return null;
  }
  if (new Set(a.option_ids).size !== a.option_ids.length) return "Duplicate options are not allowed.";
  const text = a.text.trim();
  if (q.type === "text") {
    if (a.option_ids.length) return "Text questions do not accept option selections.";
    return text || !q.required ? null : "Please type an answer.";
  }
  if (q.type === "confirmation") {
    return !text && a.option_ids.length === 1 && ["yes", "no"].includes(a.option_ids[0]!) ? null : "Choose yes or no.";
  }
  const ids = new Set(q.options.map((o) => o.id));
  const bad = a.option_ids.find((id) => !ids.has(id));
  if (bad) return `Unknown option: ${bad}`;
  if (text && !q.allow_custom_answer) return "Custom answers are not allowed for this question.";
  if (q.type === "single_select" && a.option_ids.length > 1) return "Choose one option.";
  if (!a.option_ids.length && !text) return q.required ? "Choose an option." : null;
  return null;
}

/** Human-readable answer used in the resume message and spec. */
export function describeAnswer(q: Pick<StoredQuestion, "title" | "options" | "safe_default">, a: AnswerInput): string {
  if (a.skip) return `${q.title}: skipped — use the safe default (${q.safe_default ?? "agent's recommendation"})`;
  const labels = a.option_ids.map((id) => q.options.find((o) => o.id === id)?.label ?? id);
  const parts = [...labels, a.text.trim()].filter(Boolean);
  return `${q.title}: ${parts.join("; ")}`;
}

export const suggestionInput = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(600).default(""),
  requested_approach: z.string().max(400).default(""),
  recommended_approach: z.string().min(3).max(400),
  rationale: z.string().max(600).default(""),
  expected_benefit: z.array(z.string().max(80)).max(5).default([]),
  complexity: z.enum(["low", "medium", "high"]),
  risk: z.string().max(400).default(""),
  estimated_impact: z.enum(["low", "medium", "high"]),
});
export const suggestInput = z.object({ suggestions: z.array(suggestionInput).min(1).max(2) });
export const SUGGESTION_DECISIONS = ["accepted", "rejected", "discussed"] as const;

export const specInput = z.object({
  objective: z.string().min(3).max(1000),
  success_criteria: z.array(z.string().max(300)).max(15).default([]),
  users: z.string().max(400).default(""),
  functional: z.array(z.string().max(300)).max(30).default([]),
  non_goals: z.array(z.string().max(300)).max(15).default([]),
  non_functional: z.array(z.string().max(300)).max(15).default([]),
  constraints: z.array(z.string().max(300)).max(15).default([]),
  assumptions: z.array(z.string().max(300)).max(15).default([]),
  risks: z.array(z.string().max(300)).max(15).default([]),
  acceptance_criteria: z.array(z.string().max(300)).max(20).default([]),
});
export type Spec = z.infer<typeof specInput>;

/** Prompt section for the task class: what the agent should do before high-impact work. */
export function discoveryPolicy(c: TaskClass, signals: string[]): string {
  const why = signals.length ? ` (${signals.join("; ")})` : "";
  const base = `\nTASK CLASS: ${c.replace("_", "-")}${why}.`;
  if (c === "small") return `${base} Proceed directly: inspect only the relevant files, make the targeted change and run targeted checks. Do not interview the user or dispatch a team.`;
  if (c === "medium") return `${base} Make a short plan. If (and only if) a missing detail would materially change architecture, cost, scope, security, UX or acceptance criteria, call ask_user with at most 2 questions, each with a recommended answer. Delegate only genuinely independent work.`;
  const extra = c === "high_risk" ? " This is high risk: analyse rollback and authorization impact, keep every approval boundary, and get independent review/verification before finishing." : "";
  return `${base} Before high-impact work, call update_spec with the objective, requirements, non-goals, assumptions, risks and acceptance criteria. Ask at most 5 high-impact questions in ONE ask_user call (recommended answer + reason + safe default each). If a materially better approach exists, call suggest_improvement with at most 2 suggestions — suggestions are not consent; keep the requested scope unless the user accepts.${extra} While waiting, do only reversible low-risk work that does not depend on the answers.`;
}
