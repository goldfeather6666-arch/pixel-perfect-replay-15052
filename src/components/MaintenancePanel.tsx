import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { dismissMaintenance, getMaintenance, scanMaintenance, setMaintenance } from "@/lib/maintenance.functions";
import { maintenanceDue } from "@/lib/maintenance";
export function MaintenancePanel({ id, running, onRequest }: { id: string; running: boolean; onRequest: (text: string) => void }) {
  const get = useServerFn(getMaintenance); const set = useServerFn(setMaintenance); const scan = useServerFn(scanMaintenance); const dismiss = useServerFn(dismissMaintenance);
  const qc = useQueryClient(); const attempted = useRef(false);
  const q = useQuery({ queryKey: ["maintenance", id], queryFn: () => get({ data: { id } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["maintenance", id] });
  const setting = useMutation({ mutationFn: (enabled: boolean) => set({ data: { id, enabled } }), onSuccess: () => { attempted.current = false; void refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const scanning = useMutation({ mutationFn: (automatic: boolean) => scan({ data: { id, automatic } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const rejecting = useMutation({ mutationFn: (finding: string) => dismiss({ data: { id, finding } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  useEffect(() => { if (q.data && !attempted.current && maintenanceDue(q.data.enabled, running, q.data.last)) { attempted.current = true; scanning.mutate(true); } }, [q.data, running]);
  const findings = q.data?.findings.filter((f) => !q.data?.dismissed.includes(f.id)) ?? [];
  return <section className="mx-auto max-w-3xl space-y-3 px-3 pb-4" aria-label="Idle maintenance">
    <div className="flex flex-wrap items-center gap-2 border-b pb-2">
      <ShieldCheck className="size-4 text-muted-foreground" /><h3 className="flex-1 text-sm font-semibold">Idle maintenance</h3>
      <Switch aria-label="Enable idle maintenance" checked={q.data?.enabled ?? false} disabled={running || setting.isPending || q.isLoading} onCheckedChange={(v) => setting.mutate(v)} />
      <Button size="sm" variant="outline" disabled={!q.data?.enabled || running || scanning.isPending} onClick={() => scanning.mutate(false)}><RefreshCw className={scanning.isPending ? "animate-spin" : ""} />Scan now</Button>
    </div>
    {q.isError && <p className="text-xs text-destructive">Maintenance settings could not be loaded.</p>}
    <p className="text-xs text-muted-foreground">{q.data?.last ? `Last inspection: ${new Date(q.data.last).toLocaleString()} · ${findings.length} recommendations` : "No inspection yet"}</p>
    {findings.map((f) => <div key={f.id} className="rounded-md border bg-card p-3 text-xs">
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h4 className="font-semibold">{f.title}</h4><p className="break-all text-muted-foreground">{f.path} · {f.category}</p></div>
        <Button size="icon" variant="ghost" className="size-7" aria-label={`Dismiss ${f.title}`} disabled={rejecting.isPending} onClick={() => rejecting.mutate(f.id)}><X /></Button>
        <Button size="icon" variant="outline" className="size-7" aria-label={`Review fix for ${f.title}`} disabled={running} onClick={() => onRequest(`Review this maintenance recommendation for ${f.path}: ${f.title}. ${f.recommendation} Propose a concrete patch for my review; do not deploy or apply external changes.`)}><Check /></Button>
      </div><p className="mt-2 text-muted-foreground">{f.recommendation}</p>
    </div>)}
  </section>;
}