import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bug, ChevronRight, Copy, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { bugAutopsy } from "@/lib/app.functions";
import { copyText } from "@/lib/clipboard";
import type { ReproBundle } from "@/lib/repro-bundle";

/** Bug autopsy: the repro artifact for this task's most recent run, with a one-click replay. */
export function BugAutopsy({ id, onReplay }: { id: string; onReplay: (text: string) => void }) {
  const get = useServerFn(bugAutopsy);
  const q = useQuery({ queryKey: ["autopsy", id], queryFn: () => get({ data: { id } }) });
  const [open, setOpen] = useState(false);
  const b = q.data as ReproBundle | null | undefined;

  return (
    <section className="mx-auto max-w-3xl px-3 pb-4">
      <div className="rounded-md border bg-card">
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          <Bug className="size-3.5 text-muted-foreground" />
          <span className="flex-1">Bug autopsy</span>
          <span className="text-xs font-normal text-muted-foreground">{b ? b.failure.headline : q.isLoading ? "reading…" : "no run yet"}</span>
        </button>
        {open && (
          <div className="border-t p-3 text-sm">
            {!b && <p className="text-xs text-muted-foreground">{q.isError ? "Couldn’t read the last run." : "No run recorded for this task yet."}</p>}
            {b && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {b.environment.provider}/{b.environment.model} · {b.environment.autonomy} · branch {b.environment.branch} · commit {b.environment.commit.slice(0, 7) || "?"} · root {b.environment.root} · {b.environment.outcome} · {b.window}
                </p>
                {b.evidence.length > 0 && (
                  <div>
                    <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ShieldAlert className="size-3" /> Evidence</h4>
                    <ul className="space-y-1">
                      {b.evidence.map((e, i) => (
                        <li key={i} className="rounded border bg-muted/40 p-1.5 font-mono text-[11px] break-words whitespace-pre-wrap">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {b.changed.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Files changed in that run</h4>
                    <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                      {b.changed.map((c, i) => <li key={i} className="truncate">{c.action === "delete" ? "−" : "+"} {c.path}</li>)}
                    </ul>
                  </div>
                )}
                <div>
                  <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Minimal reproduction</h4>
                  <pre className="max-h-48 overflow-auto rounded border bg-muted/40 p-2 whitespace-pre-wrap font-mono text-[11px]">{b.minimalRepro}</pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyText(b.minimalRepro).then((ok) => ok ? undefined : undefined)}><Copy className="size-3.5" /> Copy report</Button>
                  <Button size="sm" variant="outline" onClick={() => void copyText(b.replayPrompt)}><Copy className="size-3.5" /> Copy replay prompt</Button>
                  <Button size="sm" onClick={() => onReplay(b.replayPrompt)}><Play className="size-3.5" /> Replay this run</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
