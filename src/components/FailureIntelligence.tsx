import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { failureIntelligence } from "@/lib/app.functions";
import { MODE_FIX, MODE_LABEL, type FailureMode } from "@/lib/failure-intelligence";

const RANGES = [7, 30, 90] as const;

/** Failure intelligence: what actually goes wrong across your projects, from recorded runs only. */
export function FailureIntelligence() {
  const [days, setDays] = useState<number>(30);
  const q = useQuery({ queryKey: ["failure-intelligence", days], queryFn: () => failureIntelligence({ data: { days } }) });
  const s = q.data;

  return (
    <section className="panel rounded-2xl p-3.5 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight"><ShieldAlert className="size-4 text-primary" /> Failure intelligence</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Where runs actually stall, how much was rework, and how often you had to step in — across every project you own.</p>
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
      {s && s.runs === 0 && (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No completed runs recorded in the last {days} days. Run the agent and its post-run reports appear here.
        </p>
      )}
      {s && s.runs > 0 && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Runs" value={String(s.runs)} />
            <Stat label="Rework ratio" value={s.avgReworkRatio === null ? "—" : `${Math.round(s.avgReworkRatio * 100)}%`} hint="Writes that re-touched a file the run had already touched" />
            <Stat label="You stepped in" value={s.interventionsPerRun === null ? "—" : `${s.interventionsPerRun}/run`} hint="Questions, approvals, live-chat nudges and resumes" />
            <Stat label="Started with context" value={s.priorContextShare === null ? "—" : `${Math.round(s.priorContextShare * 100)}%`} hint="Runs that began with repo memory, a project doc or saved facts" />
          </dl>

          {s.modes.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No failure modes recorded — every run in this window finished without a classified stall.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {s.modes.map((m) => (
                <li key={m.mode} className="rounded-lg border bg-card/70 p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden />
                    <span className="text-sm font-medium">{MODE_LABEL[m.mode]}</span>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">{m.runs} run{m.runs === 1 ? "" : "s"} · {Math.round(m.share * 100)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(m.share * 100)} percent of runs`}>
                    <div className="h-full rounded-full bg-warning" style={{ width: `${Math.max(2, m.share * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{MODE_FIX[m.mode as FailureMode]}</p>
                </li>
              ))}
            </ul>
          )}

          {s.perProject.length > 1 && (
            <details className="mt-4 rounded-lg border bg-card/70 p-3 text-xs">
              <summary className="cursor-pointer font-medium">Per project ({s.perProject.length})</summary>
                <ul className="mt-2 space-y-1">
                  {s.perProject.map((p) => (
                    <li key={p.repo} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="min-w-0 flex-1 truncate font-mono">{p.repo}</span>
                      <span className="tabular-nums text-muted-foreground">{p.runs} run{p.runs === 1 ? "" : "s"}</span>
                      <span className={p.failures ? "text-warning" : "text-success"}>{p.failures ? `${p.failures} stall${p.failures === 1 ? "" : "s"}` : "clean"}</span>
                      {p.topMode && <span className="text-muted-foreground">· {MODE_LABEL[p.topMode]}</span>}
                    </li>
                  ))}
                </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card/70 p-2.5">
      <dt className="text-[11px] text-muted-foreground" title={hint}>{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
