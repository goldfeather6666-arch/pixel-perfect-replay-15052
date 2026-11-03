import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, ListChecks, ShieldCheck, ShieldX, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fileHistory } from "@/lib/app.functions";

/**
 * Prompt audit ("why did this happen?"): the user requests that drove each change to one file,
 * the acceptance criteria the run was working to, and the verification evidence that run produced.
 */
export function FileProvenance({ id, path, label = "Why?" }: { id: string; path: string; label?: string }) {
  const fetchHistory = useServerFn(fileHistory);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["provenance", id, path],
    queryFn: () => fetchHistory({ data: { id, path } }),
    enabled: open,
  });

  const changes = q.data?.changes ?? [];
  const evidence = q.data?.evidence ?? [];
  const criteria = q.data?.criteria ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
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
        {q.data && (
          <div className="space-y-4 text-sm">
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Sparkles className="size-3" /> Request that drove it</h4>
              {changes.length === 0 && <p className="text-xs text-muted-foreground">No request recorded for this file yet — it changed before prompt tracking existed, or in a run that made no edits.</p>}
              <ul className="space-y-2">
                {changes.map((c, i) => (
                  <li key={i} className="rounded-lg border bg-card p-2.5">
                    <p className="whitespace-pre-wrap break-words line-clamp-4">{c.prompt || "No prompt recorded"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {c.action === "delete" ? "deleted" : "written"} by {c.tool === "write_files" ? "a multi-file edit" : c.tool.replace(/_/g, " ")} · {new Date(c.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            {criteria.length > 0 && (
              <section>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ListChecks className="size-3" /> Done when</h4>
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {criteria.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </section>
            )}
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ShieldCheck className="size-3" /> Verification evidence</h4>
              {evidence.length === 0 && <p className="text-xs text-muted-foreground">No quality-check result saved for these runs yet.</p>}
              <ul className="space-y-1.5">
                {evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg border bg-card p-2 text-xs">
                    {e.passed ? <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : <ShieldX className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
                    <span className="min-w-0">
                      {e.passed ? "Checks passed" : e.cached ? "Checks reused from an earlier pass" : "Checks failed"}
                      {e.failedStep ? ` at ${String(e.failedStep)}` : ""}
                      {e.failureKind ? ` · ${String(e.failureKind)}` : ""}
                      {typeof e.totalMs === "number" ? ` · ${(e.totalMs as number) / 1000}s` : ""}
                      <span className="block text-[11px] text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
