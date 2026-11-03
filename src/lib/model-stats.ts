// Model comparison: turns the owner's own run records into an honest quality/cost view per model.
// A run only counts against a model's success rate when it reached a decisive outcome — a cancelled
// or still-awaiting-approval run says nothing about the model, so it never counts as a failure.

export type RunRow = {
  provider: string;
  model: string;
  outcome: string | null;
  stage: string;
  metrics: Record<string, unknown> | null;
  startedAt: string;
};

export type ModelStat = {
  key: string;
  provider: string;
  model: string;
  runs: number;
  completed: number;
  failed: number;
  cancelled: number;
  undecided: number;
  successRate: number | null;
  avgTotalMs: number | null;
  avgFirstTokenMs: number | null;
  avgSteps: number | null;
  inputTokens: number;
  outputTokens: number;
  qaRuns: number;
  qaPassed: number;
  stages: string[];
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const avg = (values: number[]) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);

export function aggregateModelStats(rows: RunRow[]): ModelStat[] {
  const groups = new Map<string, RunRow[]>();
  for (const r of rows) {
    const key = `${r.provider || "unknown"}::${r.model || "unknown"}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const stats: ModelStat[] = [];
  for (const [key, list] of groups) {
    const [provider = "unknown", model = "unknown"] = key.split("::");
    const completed = list.filter((r) => r.outcome === "completed").length;
    const failed = list.filter((r) => r.outcome === "failed").length;
    const cancelled = list.filter((r) => r.outcome === "cancelled").length;
    const undecided = list.length - completed - failed - cancelled;
    const totals: number[] = [];
    const firsts: number[] = [];
    const steps: number[] = [];
    let input = 0;
    let output = 0;
    let qaRuns = 0;
    let qaPassed = 0;
    for (const r of list) {
      const m = r.metrics ?? {};
      const t = num(m["totalMs"]);
      if (t !== null) totals.push(t);
      const f = num(m["timeToFirstTokenMs"]);
      if (f !== null) firsts.push(f);
      const s = num(m["steps"]);
      if (s !== null) steps.push(s);
      const usage = (m["usage"] ?? {}) as Record<string, unknown>;
      input += num(usage["input"]) ?? 0;
      output += num(usage["output"]) ?? 0;
      if (typeof m["qaPassed"] === "boolean") {
        qaRuns += 1;
        if (m["qaPassed"]) qaPassed += 1;
      }
    }
    stats.push({
      key,
      provider,
      model,
      runs: list.length,
      completed,
      failed,
      cancelled,
      undecided,
      successRate: completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : null,
      avgTotalMs: avg(totals),
      avgFirstTokenMs: avg(firsts),
      avgSteps: avg(steps),
      inputTokens: input,
      outputTokens: output,
      qaRuns,
      qaPassed,
      stages: [...new Set(list.map((r) => r.stage))].sort(),
    });
  }
  return stats.sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model));
}

/** Share of runs that reached a decisive outcome, for labelling a low-sample model. */
export function decisiveShare(s: ModelStat): number {
  const decisive = s.completed + s.failed;
  return s.runs ? Math.round((decisive / s.runs) * 100) : 0;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
