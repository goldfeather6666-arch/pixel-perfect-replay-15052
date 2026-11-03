import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { modelComparison } from "@/lib/app.functions";
import { decisiveShare, formatDuration, type ModelStat } from "@/lib/model-stats";

const RANGES = [7, 30, 90] as const;

/** Model comparison: quality and cost per model, computed only from this owner's own run records. */
export function ModelPerformance() {
  const [days, setDays] = useState<number>(30);
  const q = useQuery({ queryKey: ["model-comparison", days], queryFn: () => modelComparison({ data: { days } }) });

  return (
    <section className="panel rounded-2xl p-3.5 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight"><BarChart3 className="size-4 text-primary" /> Model performance</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Quality and cost per model, from your own runs. Cancelled or still-awaiting runs never count as failures.</p>
        </div>
        <div className="flex gap-1 rounded-full border bg-muted/40 p-0.5 text-xs" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={days === r} onClick={() => setDays(r)} className={`rounded-full px-2.5 py-1 font-medium ${days === r ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{r}d</button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void q.refetch()} disabled={q.isFetching}><RefreshCw className={q.isFetching ? "size-3.5 animate-spin" : "size-3.5"} /></Button>
      </div>

      {q.isLoading && <p className="mt-4 text-sm text-muted-foreground">Reading your runs…</p>}
      {q.isError && <p className="mt-4 text-sm text-destructive">Couldn’t load run history: {(q.error as Error).message}</p>}
      {q.data && q.data.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No runs recorded in the last {days} days. Ask the agent to build something and this comparison fills in.
        </p>
      )}
      {q.data && q.data.length > 0 && (
        <ul className="mt-4 space-y-2">
          {q.data.map((s) => <ModelRow key={s.key} s={s} />)}
        </ul>
      )}
    </section>
  );
}

function ModelRow({ s }: { s: ModelStat }) {
  const rate = s.successRate;
  const lowSample = decisiveShare(s) < 50;
  return (
    <li className="rounded-lg border bg-card/70 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="truncate font-mono text-sm font-medium">{s.model}</span>
        <span className="text-[11px] text-muted-foreground">{s.provider}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{s.runs} run{s.runs === 1 ? "" : "s"}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${rate === null ? "no decisive outcome yet" : `${rate}% of decisive runs completed`}`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${rate ?? 0}%` }} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Completed</dt><dd className="tabular-nums">{rate === null ? "—" : `${rate}%`}{lowSample && <span className="ml-1 text-warning" title="Few decisive runs — treat with caution">· few runs</span>}</dd></div>
        <div><dt className="text-muted-foreground">First reply</dt><dd className="tabular-nums">{formatDuration(s.avgFirstTokenMs)}</dd></div>
        <div><dt className="text-muted-foreground">Whole task</dt><dd className="tabular-nums">{formatDuration(s.avgTotalMs)}</dd></div>
        <div><dt className="text-muted-foreground">Checks passed</dt><dd className="tabular-nums">{s.qaRuns ? `${s.qaPassed}/${s.qaRuns}` : "—"}</dd></div>
      </dl>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {s.completed} done · {s.failed} failed · {s.cancelled} stopped · {s.undecided} still open · {s.inputTokens + s.outputTokens ? `${fmt(s.inputTokens)} in / ${fmt(s.outputTokens)} out tokens` : "no token count reported"}
      </p>
    </li>
  );
}

function fmt(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}
