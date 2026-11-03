// Post-run report writer. Reads only what this run actually recorded (events, error logs,
// provenance) and turns it into the failure-intelligence report, then appends it as a run event.
// Runs on the server inside the agent stream; never blocks or fails the run.
import type { SupabaseClient } from "@supabase/supabase-js";
import { postRunReport, type PostRunReport, type RunEvidence } from "./failure-intelligence";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type ReportFacts = {
  runId: string | null;
  sessionId: string;
  stage: string;
  outcomeState: string | null;
  checksAttempted: boolean;
  checksPassed: boolean;
  previewVerified: boolean;
  ambiguousWrites: number;
  pendingApprovals: number;
  questionsAsked: number;
  interjections: number;
  resumed: boolean;
  durationMs: number;
  steps: number;
  blocker: string | null;
  priorContext: { repoMemory: boolean; typedMemories: number; projectDoc: boolean; history: number };
};

/** Build the report from recorded evidence only. Returns null when the run itself was never recorded. */
export async function buildRunReport(sb: SupabaseClient, f: ReportFacts): Promise<PostRunReport | null> {
  if (!f.runId) return null;
  const [eventsRes, errorsRes, provRes] = await Promise.all([
    sb.from("agent_events").select("type, payload").eq("run_id", f.runId).order("seq", { ascending: true }).limit(4000),
    sb.from("agent_error_logs").select("category, retryable, message").eq("run_id", f.runId).limit(200),
    sb.from("change_provenance").select("path, action").eq("run_id", f.runId).limit(2000),
  ]);
  const events = (eventsRes.data ?? []) as { type: string; payload: unknown }[];
  const errors = (errorsRes.data ?? []) as { category: string; retryable: boolean; message: string }[];
  const provenance = (provRes.data ?? []) as { path: string; action: string }[];

  const gate = [...events].reverse().find((e) => e.type === "qa.gate");
  const budget = [...events].reverse().find((e) => e.type === "budget.check");
  const policy = [...events].reverse().find((e) => e.type === "policy.check");
  const context = events.find((e) => e.type === "context.loaded");
  const gateP = obj(gate?.payload);
  const ctx = obj(context?.payload);
  const toolResults = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== "tool.execution.completed") continue;
    const p = obj(e.payload);
    if (typeof p.tool !== "string") continue;
    const outcomes = toolResults.get(p.tool) ?? new Set<string>();
    outcomes.add(p.ok === false ? "failed" : "ok");
    toolResults.set(p.tool, outcomes);
  }
  const writes = provenance.filter((p) => p.action !== "delete");
  const paths = new Set(writes.map((p) => p.path));
  const accessWords = /(permission|forbidden|unauthori[sz]ed|access denied|token expired|not connected|no .* linked)/i;

  const evidence: RunEvidence = {
    stage: f.stage,
    outcomeState: f.outcomeState,
    errorCategories: [...new Set(errors.map((e) => e.category))],
    gate: gate
      ? { passed: gateP["passed"] === true, failureKind: typeof gateP["failureKind"] === "string" ? (gateP["failureKind"] as string) : null, failedStep: typeof gateP["failedStep"] === "string" ? (gateP["failedStep"] as string) : null }
      : null,
    budgetOk: budget ? obj(budget.payload)["ok"] === true : null,
    policyOk: policy ? obj(policy.payload)["ok"] === true : null,
    checksAttempted: f.checksAttempted || !!gate,
    checksPassed: f.checksPassed || gateP["passed"] === true,
    ambiguousWrites: f.ambiguousWrites,
    failedTools: events.filter((e) => e.type === "tool.execution.completed" && obj(e.payload)["ok"] === false).length,
    toolFlipFlop: [...toolResults.values()].some((s) => s.size > 1),
    repairRounds: events.filter((e) => e.type === "repair.started").length,
    autoContinues: events.filter((e) => e.type === "run.auto_continue").length,
    compacted: events.filter((e) => e.type === "context.compacted").length,
    droppedForBudget: num(ctx["droppedForBudget"]),
    resumed: f.resumed,
    modelFallbacks: events.filter((e) => e.type === "model.fallback").length,
    questionsAsked: f.questionsAsked,
    interjections: f.interjections,
    pendingApprovals: f.pendingApprovals,
    writes: writes.length,
    distinctPaths: paths.size,
    durationMs: f.durationMs,
    steps: f.steps,
    blockedOnAccess: !!f.blocker && accessWords.test(f.blocker),
    priorContext: f.priorContext,
  };
  return postRunReport(evidence);
}

/** Append the report as a durable run event so every session carries its own post-run record. */
export async function recordRunReport(sb: SupabaseClient, report: PostRunReport | null): Promise<void> {
  if (!report || !report.mode) return;
  await sb.rpc("engine_event", { _run: null, _type: "run.report", _payload: report as unknown as Record<string, unknown> }).then(() => {}, () => {});
}
