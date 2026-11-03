// Post-run evidence writer. Reads only what this run actually recorded (events, error logs,
// provenance, saved spec) and turns it into two durable artefacts: the failure-intelligence report
// and the verification-first evidence table. Runs inside the agent stream; a read failure simply
// yields nothing and never breaks the user's run.
import type { SupabaseClient } from "@supabase/supabase-js";
import { postRunReport, type PostRunReport, type RunEvidence } from "./failure-intelligence";
import { criteriaToItems, evidenceRows, type CheckRun, type EvidenceRow } from "./verification-first";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

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
  criteria: string[];
  priorContext: { repoMemory: boolean; typedMemories: number; projectDoc: boolean; history: number };
};

export type RunSummary = { report: PostRunReport; table: EvidenceRow[] };

/**
 * Build the run's post-run report and evidence table from recorded facts only.
 * Returns null when the run itself was never recorded.
 */
export async function buildRunSummary(sb: SupabaseClient, f: ReportFacts): Promise<RunSummary | null> {
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
      ? {
          passed: gateP["passed"] === true,
          failureKind: str(gateP["failureKind"]) || null,
          failedStep: str(gateP["failedStep"]) || null,
        }
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

  return { report: postRunReport(evidence), table: evidenceTableFromEvents(events, f.criteria) };
}

/** Every check that really ran, as a ladder row: shell exit codes, route statuses, gate verdicts. */
export function checksFromEvents(events: { type: string; payload: unknown }[]): CheckRun[] {
  const checks: CheckRun[] = [];
  for (const e of events) {
    if (e.type === "qa.gate") {
      const p = obj(e.payload);
      for (const step of Array.isArray(p["steps"]) ? (p["steps"] as unknown[]) : []) {
        const s = obj(step);
        if (typeof s["name"] !== "string") continue;
        const exit = typeof s["exit"] === "number" ? s["exit"] : null;
        checks.push({ name: s["name"], exit, ms: typeof s["ms"] === "number" ? s["ms"] : null });
      }
    } else if (e.type === "budget.check") {
      checks.push({ name: "budget", exit: obj(e.payload)["ok"] === true ? 0 : 1 });
    } else if (e.type === "policy.check") {
      checks.push({ name: "policy", exit: obj(e.payload)["ok"] === true ? 0 : 1 });
    } else if (e.type === "quality.score") {
      checks.push({ name: `preview quality ${str(obj(e.payload)["path"]) || "/"}`, exit: num(obj(e.payload)["blockers"]) > 0 ? 1 : 0 });
    } else if (e.type === "route.probe") {
      const p = obj(e.payload);
      const status = num(p["status"]);
      checks.push({ name: `preview ${str(p["path"]) || "/"}`, exit: status >= 200 && status < 400 ? 0 : 1 });
    }
  }
  return checks;
}

/**
 * The handoff evidence table: one row per acceptance criterion plus one row per check that ran.
 * A criterion with no matching check stays unverified — it can never inherit an unrelated pass.
 */
export function evidenceTableFromEvents(events: { type: string; payload: unknown }[], criteria: string[]): EvidenceRow[] {
  const checks = checksFromEvents(events);
  const criterionRows = evidenceRows(criteriaToItems(criteria.map((text) => ({ text, required: true })), checks));
  const checkRows = evidenceRows(checks.map((c) => ({ item: c.name, criteria: "required", check: c })));
  const seen = new Set<string>();
  return [...criterionRows, ...checkRows].filter((r) => {
    const key = `${r.item}|${r.testRun}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
