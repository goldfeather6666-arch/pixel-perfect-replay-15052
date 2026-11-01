import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyMigrations, getMigrationStatus } from "@/lib/integrations.functions";

export function DatabaseApproval({ id, linked, busy }: { id: string; linked: boolean; busy: boolean }) {
  const qc = useQueryClient();
  const getStatus = useServerFn(getMigrationStatus);
  const apply = useServerFn(applyMigrations);
  const [confirm, setConfirm] = useState(false);
  const [deferred, setDeferred] = useState("");
  const status = useQuery({ queryKey: ["migrations", id], queryFn: () => getStatus({ data: { id } }), enabled: linked && !busy, refetchInterval: busy ? false : 5000 });
  const files = status.data?.pending ?? [];
  const fingerprint = JSON.stringify(files);
  const mutation = useMutation({
    mutationFn: () => apply({ data: { id } }),
    onSuccess: (result) => {
      setConfirm(false);
      if (result.error) toast.error(`${result.error.file}: ${result.error.message}`);
      else toast.success(`Applied ${result.applied.length} database change(s)`);
      void qc.invalidateQueries({ queryKey: ["migrations", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!linked || !files.length) return null;
  return <section aria-label="Database change approval" aria-live="polite" className="min-w-0 rounded-md border bg-card p-3 space-y-3">
    <h3 className="flex items-center gap-2 font-semibold"><Database className="size-4" /> Database changes awaiting approval</h3>
    <ul className="space-y-1 text-xs font-mono">{files.map((file) => <li key={file} className="break-all">{file}</li>)}</ul>
    <p className="text-xs text-muted-foreground">Applying these files changes the linked database. Approve any staged files first.</p>
    {confirm && <p className="text-sm text-destructive">Confirm applying all currently pending migration files to the linked database?</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy || mutation.isPending} onClick={() => { if (confirm) mutation.mutate(); else { setConfirm(true); setDeferred(""); } }}>{mutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}{confirm ? "Confirm & apply" : "Review & approve"}</Button>
      <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { setConfirm(false); setDeferred(fingerprint); }}>Not now</Button>
    </div>
    {deferred === fingerprint && <p role="status" className="text-xs text-muted-foreground">Deferred — no database changes applied.</p>}
  </section>;
}