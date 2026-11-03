import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Circle, Link2, Loader2, XCircle } from "lucide-react";
import { syncProject } from "@/lib/connect.functions";
import type { SyncStep } from "@/lib/connect";
import { Button } from "@/components/ui/button";

const ICON = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-destructive" />,
  skip: <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />,
};

export function HealthList({ steps }: { steps: SyncStep[] }) {
  return (
    <ul className="space-y-2">
      {steps.map((s) => (
        <li key={s.key} className="flex gap-2 text-sm">
          {ICON[s.state]}
          <div className="min-w-0"><p className="font-medium leading-tight">{s.label}</p><p className="break-words text-xs text-muted-foreground">{s.note}</p></div>
        </li>
      ))}
    </ul>
  );
}

/** "Connect & sync" card for the Deploy tab: one tap wires everything and shows a checklist. */
export function ConnectSyncCard({ id }: { id: string }) {
  const [steps, setSteps] = useState<SyncStep[] | null>(null);
  const sync = useServerFn(syncProject);
  const m = useMutation({
    mutationFn: () => sync({ data: { id } }),
    onSuccess: (r) => { setSteps(r.steps); r.overall === "ok" ? toast.success("Everything is connected and in sync") : toast.message("Synced — see what still needs attention"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="min-w-0 rounded-lg border border-primary/30 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">Connect & sync</h2>
          <p className="text-xs text-muted-foreground">Links GitHub, database and Vercel, fixes sign-in links, applies database changes and checks the live site.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Sync now</Button>
      </div>
      {steps && <div className="mt-3"><HealthList steps={steps} /></div>}
    </section>
  );
}
