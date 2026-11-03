import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, History, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getVerificationHistory } from "@/lib/app.functions";
const names = { jsKb: "JavaScript · KB", cssKb: "CSS · KB", totalKb: "Total · KB", lcpMs: "LCP · ms", cls: "Layout shift" };
const statuses = { passed: "Passed", failed: "Blocked", unmeasured: "Unverified", stale: "Revision changed" };
export function VerificationHistory({ id, running }: { id: string; running: boolean }) {
  const [open, setOpen] = useState(false);
  const get = useServerFn(getVerificationHistory);
  const q = useQuery({ queryKey: ["verification-history", id], queryFn: () => get({ data: { id } }), enabled: open, refetchInterval: open && running ? 5000 : false });
  return <section className="mx-auto max-w-3xl px-3 pb-4">
    <div className="flex items-center border-b">
      <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-2 px-0 py-3" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} /><History className="size-3.5 shrink-0 text-muted-foreground" /> Verification history
      </Button>
      {open && <Button size="icon" variant="ghost" title="Refresh history" aria-label="Refresh history" disabled={q.isFetching} onClick={() => void q.refetch()}><RotateCw className={`size-3.5 ${q.isFetching ? "animate-spin" : ""}`} /></Button>}
    </div>
    {open && <div className="space-y-3 pt-3">
      {q.isPending && <p className="text-xs text-muted-foreground">Reading checks…</p>}
      {q.isError && <p role="alert" className="text-xs text-destructive">Couldn’t read checks. Try refreshing.</p>}
      {q.data?.length === 0 && <p className="text-xs text-muted-foreground">No budget or required-check evidence recorded yet.</p>}
      {q.data?.map((r) => <article key={r.id} className="rounded-md border bg-card p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{r.kind === "budget" ? "Performance budget" : "Required checks"}</span><span className={r.status === "passed" ? "text-success" : r.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{statuses[r.status]}</span></div>
        <p className="mt-1 break-all font-mono text-muted-foreground">{r.commit?.slice(0, 8) ?? "Commit unknown"} · {r.root}</p>
        <time className="mt-1 block text-muted-foreground" dateTime={r.at}>{new Date(r.at).toLocaleString()}</time>
        {r.measurements.length > 0 && <dl className="mt-2 space-y-1">{r.measurements.map((m) => <div key={m.metric} className="flex flex-wrap justify-between gap-2"><dt>{names[m.metric]}</dt><dd className={m.actual !== null && m.actual > m.limit ? "text-destructive" : "text-muted-foreground"}>{m.actual ?? "Not measured"} / {m.limit}</dd></div>)}</dl>}
        {r.missing.length > 0 && <p className="mt-2 break-words text-destructive">Missing passing checks: {r.missing.join(", ")}</p>}
      </article>)}
    </div>}
  </section>;
}