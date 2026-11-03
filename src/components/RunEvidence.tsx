import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, RotateCw, Table2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getRunEvidence } from "@/lib/app.functions";
import { MODE_LABEL } from "@/lib/failure-intelligence";
import { formatDuration } from "@/lib/model-stats";

const RESULTS = { pass: "pass", fail: "fail", unverified: "unverified" } as const;
const CLASSES = { pass: "text-success", fail: "text-destructive", unverified: "text-muted-foreground" } as const;

/** The verification-first handoff table: what was claimed, what actually ran, and the measured result. */
export function RunEvidence({ id, running }: { id: string; running: boolean }) {
  const [open, setOpen] = useState(false);
  const get = useServerFn(getRunEvidence);
  const q = useQuery({ queryKey: ["run-evidence", id], queryFn: () => get({ data: { id } }), enabled: open, refetchInterval: open && running ? 5000 : false });
  const rows = q.data?.table ?? [];
  const report = q.data?.report ?? null;

  return (
    <section className="mx-auto max-w-3xl px-3 pb-4">
      <div className="flex items-center border-b">
        <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-2 px-0 py-3" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          <Table2 className="size-3.5 shrink-0 text-muted-foreground" /> Evidence table
        </Button>
        {open && <Button size="icon" variant="ghost" title="Refresh evidence" aria-label="Refresh evidence" disabled={q.isFetching} onClick={() => void q.refetch()}><RotateCw className={`size-3.5 ${q.isFetching ? "animate-spin" : ""}`} /></Button>}
      </div>
      {open && (
        <div className="space-y-3 pt-3">
          {q.isPending && <p className="text-xs text-muted-foreground">Reading this run’s checks…</p>}
          {q.isError && <p role="alert" className="text-xs text-destructive">Couldn’t read the evidence. Try refreshing.</p>}
          {q.data && rows.length === 0 && !report && (
            <p className="text-xs text-muted-foreground">No evidence recorded yet. It appears after a run that executed checks — nothing here is generated from a model’s claims.</p>
          )}
          {report && (
            <div className="rounded-md border bg-card p-3 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">Post-run report</span>
                <span className={report.mode ? "text-warning" : "text-success"}>{report.mode ? MODE_LABEL[report.mode] : "No stall classified"}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                <div><dt className="text-muted-foreground">Time</dt><dd className="tabular-nums">{formatDuration(report.durationMs)}</dd></div>
                <div><dt className="text-muted-foreground">Steps</dt><dd className="tabular-nums">{report.steps}</dd></div>
                <div><dt className="text-muted-foreground">Rework</dt><dd className="tabular-nums">{Math.round(report.reworkRatio * 100)}%</dd></div>
                <div><dt className="text-muted-foreground">Interventions</dt><dd className="tabular-nums">{report.humanInterventions}</dd></div>
              </dl>
              {report.evidence.length > 0 && <ul className="mt-2 space-y-1 text-muted-foreground">{report.evidence.map((e, i) => <li key={i}>· {e}</li>)}</ul>}
              <p className="mt-2 text-muted-foreground">{report.verified ? "Checks, budget and required-check policy all held." : "Not fully verified — see the table below."}</p>
            </div>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left">
                  <tr><th className="p-2 font-medium">item</th><th className="p-2 font-medium">criteria</th><th className="p-2 font-medium">test run</th><th className="p-2 font-medium">result</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="max-w-[36ch] p-2 align-top break-words">{r.item}</td>
                      <td className="p-2 align-top text-muted-foreground">{r.criteria}</td>
                      <td className="p-2 align-top font-mono text-[11px]">{r.testRun}</td>
                      <td className={`p-2 align-top font-medium ${CLASSES[r.result]}`}>{RESULTS[r.result]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
