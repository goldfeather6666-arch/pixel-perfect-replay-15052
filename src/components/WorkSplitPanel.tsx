import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { splitWork } from "@/lib/app.functions";
import { MAX_SPLIT_TASK_CHARS, workSplitPrompt, type WorkSplit } from "@/lib/work-split";

const roleStyle: Record<string, string> = {
  master: "bg-primary text-primary-foreground",
  explorer: "bg-secondary text-secondary-foreground",
  coder: "bg-accent text-accent-foreground",
  tester: "bg-muted text-foreground",
};

/** Lets the user describe a task and have their chosen model split it across team roles. */
export function WorkSplitPanel({ credId, model, repo, onPrompt }: { credId: string; model: string; repo: string; onPrompt: (p: string | null) => void }) {
  const split = useServerFn(splitWork);
  const [task, setTask] = useState("");
  const [plan, setPlan] = useState<WorkSplit | null>(null);
  const m = useMutation({
    mutationFn: () => split({ data: { credential_id: credId, model, task, repo: repo || undefined } }),
    onSuccess: (p) => { setPlan(p); onPrompt(workSplitPrompt(task, p)); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <Label className="flex items-center gap-2"><Network className="size-4" /> Plan team work (optional)</Label>
      <Textarea value={task} maxLength={MAX_SPLIT_TASK_CHARS} onChange={(e) => { setTask(e.target.value); if (plan) { setPlan(null); onPrompt(null); } }}
        placeholder="Describe the coding task. Your selected model will divide it between the master, explorers, coders and testers." className="min-h-24 text-base sm:text-sm" />
      <Button type="button" variant="secondary" className="h-11 w-full" disabled={!credId || !model || task.trim().length < 10 || m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? "Dividing the work…" : "Divide work with my model"}
      </Button>
      {plan && (
        <div className="space-y-2">
          {plan.summary && <p className="text-sm text-muted-foreground">{plan.summary}</p>}
          <ol className="space-y-2">
            {plan.items.map((it, i) => (
              <li key={i} className="rounded-md border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${roleStyle[it.role]}`}>{it.role}</span>
                  <span className="min-w-0 break-words font-medium">{it.title}</span>
                </div>
                {it.details && <p className="mt-1 break-words text-muted-foreground">{it.details}</p>}
                {it.paths.length > 0 && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{it.paths.join(", ")}</p>}
                {it.dependsOn.length > 0 && <p className="mt-1 text-xs text-muted-foreground">After step {it.dependsOn.join(", ")}</p>}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">This plan will be ready to send as the task's first message.</p>
        </div>
      )}
    </div>
  );
}
