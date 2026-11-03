import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, ListChecks, ShieldCheck, ShieldX, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fileHistory } from "@/lib/app.functions";
import { provenanceChain, stepOutcome } from "@/lib/provenance";

/**
 * Prompt audit ("why did this happen?"): the user requests that drove each change to one file,
 * the acceptance criteria the run worked to, and the checks that actually ran for it.
 */
export function FileProvenance({ id, path, label = "Why?" }: { id: string; path: string; label?: string }) {
  const fetchHistory = useServerFn(fileHistory);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["provenance", id, path],
    queryFn: () => fetchHistory({ data: { id, path } }),
    enabled: open,
  });
  const chain = useMemo(
    () =>
      q.data
        ? provenanceChain(
            q.data.changes.map((c) => ({ runId: c.run_id, tool: c.tool, action: c.action, prompt: c.prompt, createdAt: c.created_at })),
            q.data.evidence.map((e) => ({ runId: e.runId, passed: e.passed, cached: e.cached, failedStep: e.failedStep, failureKind: e.failureKind, totalMs: e.totalMs, createdAt: e.createdAt })),
            q.data.criteria,
          )
        : null,
    [q.data],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <History className="size-3" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Why this changed</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">{path}</DialogDescription>
        </DialogHeader>
        {q.isLoading && <p className="text-sm text-muted-foreground">Looking up the request behind this change…</p>}
        {q.isError && <p className="text-sm text-muted-foreground">Couldn’t load the history for this file.</p>}
        {chain && (
          <div className="space-y-4 text-sm">
            {chain.steps.length === 0 && (
              <p className="text-xs text-muted-foreground">No request recorded for this file yet — it changed before prompt tracking existed, or in a run that made no edits.</p>
            )}
            {chain.steps.map((s, i) => {
              const outcome = stepOutcome(s);
              return (
                <section key={i} className="rounded-lg border bg-card p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    {outcome.ok === true && <ShieldCheck className="size-3.5 shrink-0 text-success" />}
                    {outcome.ok === false && <ShieldX className="size-3.5 shrink-0 text-destructive" />}
                    <span className="flex-1 text-xs font-semibold">{outcome.label}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{s.latest ? new Date(s.latest).toLocaleString() : ""}</span>
                  </div>
                  <p className="mb-2 flex items-start gap-1.5 text-xs">
                    <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span className="whitespace-pre-wrap break-words">{s.prompt || "No prompt recorded"}</span>
                  </p>
                  <ul className="mb-2 space-y-0.5 text-[11px] text-muted-foreground">
                    {s.changes.map((c, j) => (
                      <li key={j} className="truncate">
                        {c.action === "delete" ? "deleted" : "wrote"} {path} · {c.tool.replace(/_/g, " ")}
                      </li>
                    ))}
                  </ul>
                  {s.evidence.length > 0 && (
                    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                      {s.evidence.map((e, j) => (
                        <li key={j}>
                          checks {e.passed === true ? "passed" : "failed"}
                          {e.cached === true ? " (reused from an earlier pass)" : ""}
                          {e.failedStep != null ? ` at ${String(e.failedStep)}` : ""}
                          {e.failureKind != null ? ` · ${String(e.failureKind)}` : ""}
                          {typeof e.totalMs === "number" ? ` · ${Math.round(e.totalMs / 100) / 10}s` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            {chain.criteria.length > 0 && (
              <section>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ListChecks className="size-3" /> Done when</h4>
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {chain.criteria.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
