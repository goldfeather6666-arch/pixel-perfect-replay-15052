// Cross-project failure intelligence. Turns one run's *recorded* facts into an honest post-run
// report (time spent, rework ratio, human interventions, failure mode) and aggregates those reports
// across the owner's own projects into "top failure modes". Nothing here is inferred from what the
// model said it did — every field comes from run events, error logs and provenance rows.

export const FAILURE_MODES = [
  "regression",
  "config",
  "flaky",
  "auth-blocked",
  "context-loss",
  "non-determinism",
] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];

const RETRYABLE = new Set(["rate_limit", "timeout", "network", "provider"]);

export type GateEvidence = {
  passed: boolean;
  failureKind?: string | null;
  failedStep?: string | null;
};

export type RunEvidence = {
  stage: string;
  outcomeState: string | null;
  errorCategories: string[];
  gate: GateEvidence | null;
  budgetOk: boolean | null;
  policyOk: boolean | null;
  checksAttempted: boolean;
  checksPassed: boolean;
  ambiguousWrites: number;
  failedTools: number;
  toolFlipFlop: boolean;
  repairRounds: number;
  autoContinues: number;
  compacted: number;
  droppedForBudget: number;
  resumed: boolean;
  modelFallbacks: number;
  questionsAsked: number;
  interjections: number;
  pendingApprovals: number;
  writes: number;
  distinctPaths: number;
  durationMs: number;
  steps: number;
  blockedOnAccess: boolean;
  priorContext: { repoMemory: boolean; typedMemories: number; projectDoc: boolean; history: number };
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Rework = how much of the writing was spent touching a path this run had already touched. */
export function reworkRatio(e: Pick<RunEvidence, "writes" | "distinctPaths">): number {
  if (e.writes <= 0) return 0;
  return round(Math.max(0, e.writes - e.distinctPaths) / e.writes);
}

/**
 * Shared failure taxonomy. Rules are ordered by what a recovery engineer would fix first, and
 * each returns the concrete evidence that put it there — a label with no evidence is never given.
 */
export function classifyRun(e: RunEvidence): { mode: FailureMode | null; evidence: string[] } {
  const cats = new Set(e.errorCategories);
  const retryable = [...cats].filter((c) => RETRYABLE.has(c));
  const rework = reworkRatio(e);

  if (cats.has("authentication") || cats.has("authorization") || e.blockedOnAccess) {
    return { mode: "auth-blocked", evidence: ["the run could not authenticate or was refused access to a customer account, repository or database"] };
  }
  if (e.gate?.failureKind === "config" || cats.has("configuration") || e.policyOk === false) {
    return { mode: "config", evidence: ["a required check could not run because setup or configuration is wrong, not the code"] };
  }
  if (e.gate?.failureKind === "regression" || (e.checksAttempted && !e.checksPassed && retryable.length === 0)) {
    return {
      mode: "regression",
      evidence: [`project checks ran and failed${e.gate?.failedStep ? ` at ${e.gate.failedStep}` : ""} with no transient provider error`],
    };
  }
  if ((e.droppedForBudget > 0 || e.compacted > 0) && (e.resumed || rework > 0.2)) {
    return {
      mode: "context-loss",
      evidence: [
        `${e.droppedForBudget} earlier message(s) left the context and ${e.compacted} tool result(s) were compacted`,
        rework > 0 ? `${Math.round(rework * 100)}% of writes repeated an already-touched file` : "the run had to be resumed",
      ].filter(Boolean),
    };
  }
  if (e.ambiguousWrites > 0 || e.toolFlipFlop) {
    return {
      mode: "non-determinism",
      evidence: [
        e.ambiguousWrites > 0 ? `${e.ambiguousWrites} action(s) have an unknown outcome — the effect was never confirmed` : "",
        e.toolFlipFlop ? "the same tool call both failed and succeeded in this run" : "",
      ].filter(Boolean),
    };
  }
  if (e.gate?.failureKind === "flaky" || retryable.length > 0 || e.modelFallbacks > 0) {
    return {
      mode: "flaky",
      evidence: [
        retryable.length ? `transient provider conditions: ${retryable.join(", ")}` : "",
        e.modelFallbacks > 0 ? `${e.modelFallbacks} automatic model fallback(s)` : "",
        e.gate?.failureKind === "flaky" ? "a check failed in a way that looks transient" : "",
      ].filter(Boolean),
    };
  }
  return { mode: null, evidence: [] };
}

export type PostRunReport = {
  mode: FailureMode | null;
  evidence: string[];
  durationMs: number;
  steps: number;
  writes: number;
  distinctPaths: number;
  reworkRatio: number;
  humanInterventions: number;
  interventions: { questions: number; approvals: number; interjections: number; resumes: number };
  priorContextUsed: boolean;
  verified: boolean;
};

/** The post-run report every session gets: what it cost, how much was rework, and who had to step in. */
export function postRunReport(e: RunEvidence): PostRunReport {
  const failure = classifyRun(e);
  const p = e.priorContext;
  return {
    mode: failure.mode,
    evidence: failure.evidence,
    durationMs: Math.max(0, e.durationMs),
    steps: e.steps,
    writes: e.writes,
    distinctPaths: e.distinctPaths,
    reworkRatio: reworkRatio(e),
    humanInterventions: e.questionsAsked + e.pendingApprovals + e.interjections + (e.resumed ? 1 : 0),
    interventions: {
      questions: e.questionsAsked,
      approvals: e.pendingApprovals,
      interjections: e.interjections,
      resumes: e.resumed ? 1 : 0,
    },
    priorContextUsed: p.repoMemory || p.projectDoc || p.typedMemories > 0 || p.history > 0,
    verified: e.checksPassed && (e.budgetOk ?? true) && (e.policyOk ?? true) && e.ambiguousWrites === 0,
  };
}

export type RunReportRow = { repo: string; report: PostRunReport };

export type FailureSummary = {
  runs: number;
  failedRuns: number;
  modes: { mode: FailureMode; runs: number; share: number }[];
  topMode: FailureMode | null;
  avgReworkRatio: number | null;
  interventionsPerRun: number | null;
  /** % of runs that started with relevant prior context — the learning metric. */
  priorContextShare: number | null;
  perProject: { repo: string; runs: number; failures: number; topMode: FailureMode | null }[];
};

/** Top failure modes per owner and per project, from recorded reports only. */
export function summarizeRuns(rows: RunReportRow[]): FailureSummary {
  const runs = rows.length;
  const counts = new Map<FailureMode, number>();
  let reworkSum = 0;
  let reworkN = 0;
  let interventions = 0;
  let withContext = 0;
  let failed = 0;
  const byRepo = new Map<string, RunReportRow[]>();
  for (const { repo, report } of rows) {
    if (report.mode) {
      counts.set(report.mode, (counts.get(report.mode) ?? 0) + 1);
      failed++;
    }
    reworkSum += report.reworkRatio;
    reworkN++;
    interventions += report.humanInterventions;
    if (report.priorContextUsed) withContext++;
    const list = byRepo.get(repo);
    if (list) list.push({ repo, report });
    else byRepo.set(repo, [{ repo, report }]);
  }
  const modes = [...counts.entries()]
    .map(([mode, n]) => ({ mode, runs: n, share: runs ? round(n / runs) : 0 }))
    .sort((a, b) => b.runs - a.runs || a.mode.localeCompare(b.mode));
  const perProject = [...byRepo.entries()]
    .map(([repo, list]) => {
      const own = new Map<FailureMode, number>();
      let failures = 0;
      for (const { report } of list) if (report.mode) { failures++; own.set(report.mode, (own.get(report.mode) ?? 0) + 1); }
      const top = [...own.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return { repo, runs: list.length, failures, topMode: top ? top[0] : null };
    })
    .sort((a, b) => b.failures - a.failures || b.runs - a.runs);
  return {
    runs,
    failedRuns: failed,
    modes,
    topMode: modes[0]?.mode ?? null,
    avgReworkRatio: reworkN ? round(reworkSum / reworkN) : null,
    interventionsPerRun: runs ? round(interventions / runs) : null,
    priorContextShare: runs ? round(withContext / runs) : null,
    perProject,
  };
}

export const MODE_LABEL: Record<FailureMode, string> = {
  regression: "Code regression",
  config: "Configuration",
  flaky: "Flaky / transient",
  "auth-blocked": "Access blocked",
  "context-loss": "Context lost",
  "non-determinism": "Uncertain outcome",
};

export const MODE_FIX: Record<FailureMode, string> = {
  regression: "Fix the failing code and add a test that reproduces it before anything else.",
  config: "Repair setup, scripts, lockfile or environment settings — the application code may be fine.",
  flaky: "Retry once before changing code; if it repeats, treat it as real and isolate the cause.",
  "auth-blocked": "Reconnect or reselect the account, repository or database the task is pinned to.",
  "context-loss": "Save durable decisions early (spec/memory) and split the work so one run never needs the whole history.",
  "non-determinism": "Reconcile provider state before retrying, and make the action idempotent or approval-gated.",
};
