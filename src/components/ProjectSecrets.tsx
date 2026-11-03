import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, ExternalLink, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSecretRequest, listSecretRequests, submitSecretRequest, cancelSecretRequest } from "@/lib/project-setup.functions";
import type { SecretRequestSummary } from "@/lib/project-setup";
import { isStaleServerFunctionError, recoverChunkLoad, transientRetry } from "@/lib/chunk-recovery";

export function ProjectSecrets({ taskId, busy = false, onSend, allowCreate = false }: { taskId: string; busy?: boolean; onSend?: (message: string) => void; allowCreate?: boolean }) {
  const list = useServerFn(listSecretRequests);
  const q = useQuery({ queryKey: ["project-secrets", taskId], queryFn: async () => { try { return await list({ data: { taskId } }); } catch (e) { if (isStaleServerFunctionError(e)) recoverChunkLoad(); throw e; } }, refetchInterval: 5000, ...transientRetry, throwOnError: false });
  const [adding, setAdding] = useState(false);
  const pending = q.data?.filter((r) => ["pending", "failed", "saving"].includes(r.state)) ?? [];
  if (!pending.length && !allowCreate) return q.isError ? <p className="text-xs text-muted-foreground">Secret requests could not be checked. <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>Retry</Button></p> : null;
  return <div className="space-y-3">
    {allowCreate && <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4" /> Integration secrets</h3><Button variant="outline" size="sm" onClick={() => setAdding(!adding)}>Add secret</Button></div>}
    {allowCreate && q.isError && <p role="alert" className="text-xs text-destructive">Secret requests could not be checked. Try again.</p>}
    {adding && <RequestForm taskId={taskId} onDone={() => setAdding(false)} />}
    {pending.map((r) => <SecretForm key={r.id} taskId={taskId} request={r} busy={busy} {...(onSend ? { onSend } : {})} />)}
    {allowCreate && q.data?.filter((r) => r.state === "synced").map((r) => <p key={r.id} className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="h-3 w-3" /> {r.name} · sent to {r.targets.join(", ")}</p>)}
  </div>;
}

function RequestForm({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const request = useServerFn(createSecretRequest);
  const qc = useQueryClient();
  const [name, setName] = useState(""); const [purpose, setPurpose] = useState(""); const [sourceUrl, setSource] = useState("");
  const [target, setTarget] = useState<"production" | "preview" | "development">("production"); const [saving, setSaving] = useState(false);
  return <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await request({ data: { taskId, request: { name, purpose, sourceUrl, targets: [target] } } }); await qc.invalidateQueries({ queryKey: ["project-secrets", taskId] }); onDone(); } catch { toast.error("Check the secret name, purpose and HTTPS provider settings link."); } finally { setSaving(false); } }}>
    <Input aria-label="Secret variable name" placeholder="STRIPE_SECRET_KEY" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} required />
    <Input aria-label="Secret purpose" placeholder="Why this app needs this secret" value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
    <Input aria-label="Provider settings URL" placeholder="https://provider.example/settings" type="url" value={sourceUrl} onChange={(e) => setSource(e.target.value)} required />
    <Select value={target} onValueChange={(v) => { if (v === "production" || v === "preview" || v === "development") setTarget(v); }}><SelectTrigger aria-label="Vercel environment"><SelectValue /></SelectTrigger><SelectContent>{["production", "preview", "development"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
    <Button disabled={saving} type="submit">Request secure input</Button>
  </form>;
}

function SecretForm({ taskId, request: r, busy, onSend }: { taskId: string; request: SecretRequestSummary; busy: boolean; onSend?: (message: string) => void }) {
  const inputId = useId();
  const save = useServerFn(submitSecretRequest); const cancel = useServerFn(cancelSecretRequest); const qc = useQueryClient();
  const [value, setValue] = useState(""); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["project-secrets", taskId] });
  return <form className="space-y-3 rounded-lg border bg-card p-3" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await save({ data: { taskId, requestId: r.id, value } }); setValue(""); setSaved(true); toast.success("Secret encrypted and sent to Vercel"); if (!busy && onSend) onSend(`The requested ${r.name} is saved and synced to Vercel (${r.targets.join(", ")}). Continue using the environment variable; never read or print its value. Deployment still needs normal approval.`); await refresh(); } catch { setValue(""); toast.error("Could not sync the secret. Check Vercel access and try again."); } finally { setSaving(false); } }}>
    <Label htmlFor={inputId} className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> {r.name}</Label>
    <p className="text-xs text-muted-foreground">{r.purpose}</p>
    <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">Open provider settings <ExternalLink className="h-3 w-3" /></a>
    <Input id={inputId} type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste secret securely" required disabled={r.state === "saving" || saved} />
    <p className="text-xs text-muted-foreground">Encrypted and sent only to this task’s Vercel website · {r.targets.join(", ")}. Never shared with chat or GitHub. A rebuild is not started automatically.</p>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!value || saving || saved || r.state === "saving"}>{saving || r.state === "saving" ? "Saving…" : "Save & send to Vercel"}</Button><Button type="button" variant="ghost" size="icon" aria-label="Cancel secret request" title="Cancel secret request" disabled={saving || r.state === "saving"} onClick={async () => { try { await cancel({ data: { taskId, requestId: r.id } }); qc.setQueryData<SecretRequestSummary[]>(["project-secrets", taskId], (rows) => rows?.map((row) => row.id === r.id ? { ...row, state: "cancelled" } : row)); await refresh(); } catch { toast.error("Request could not be cancelled"); } }}><X /></Button></div>
  </form>;
}