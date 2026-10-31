import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cpu } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCredentials, listModels, updateSession } from "@/lib/app.functions";

/** Lets the user switch the AI key/provider and model of an ongoing task; applies from the next message. */
export function ModelSwitcher({ id, credentialId, model, fallbackModel, disabled }: { id: string; credentialId: string | null; model: string; fallbackModel?: string | null; disabled?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cred, setCred] = useState(credentialId ?? "");
  const [m, setM] = useState(model);
  const [saving, setSaving] = useState(false);
  const [fb, setFb] = useState(fallbackModel ?? "");
  const fetchCreds = useServerFn(listCredentials);
  const fetchModels = useServerFn(listModels);
  const update = useServerFn(updateSession);
  const creds = useQuery({ queryKey: ["credentials"], queryFn: () => fetchCreds(), enabled: open });
  const models = useQuery({ queryKey: ["models", cred], queryFn: () => fetchModels({ data: { id: cred } }), enabled: open && !!cred, retry: false });
  useEffect(() => { if (open) { setCred(credentialId ?? ""); setM(model); setFb(fallbackModel ?? ""); } }, [open, credentialId, model, fallbackModel]);

  async function save() {
    if (!cred || !m) return;
    setSaving(true);
    try {
      await update({ data: { id, credential_id: cred, model: m, fallback_model: fb && fb !== m ? fb : null } });
      await qc.invalidateQueries({ queryKey: ["session", id] });
      toast.success(`Next messages will use ${m}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch model");
    } finally { setSaving(false); }
  }

  return (
    <>
      <button type="button" disabled={disabled} title={disabled ? "Stop the current run to switch model" : "Switch AI provider or model"}
        onClick={() => setOpen(true)}
        className="flex min-w-0 max-w-[9rem] shrink items-center gap-1 rounded border px-2 py-0.5 font-mono hover:border-primary disabled:opacity-50">
        <Cpu className="h-3 w-3 shrink-0" /><span className="truncate">{model || "model"}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Switch AI provider & model</DialogTitle>
            <DialogDescription>Applies from your next message. Chat history, files and branch stay the same.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={cred} onValueChange={(v) => { setCred(v); setM(""); }}>
              <SelectTrigger className="h-11 w-full [&>span]:truncate"><SelectValue placeholder={creds.isLoading ? "Loading…" : "Choose AI key"} /></SelectTrigger>
              <SelectContent>{creds.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.label || c.provider} · {c.provider} ···{c.last4}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={m} onValueChange={setM} disabled={!cred}>
              <SelectTrigger className="h-11 w-full [&>span]:truncate"><SelectValue placeholder={models.isLoading ? "Loading…" : "Choose model"} /></SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">{models.data?.map((x) => <SelectItem className="break-all" key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
            {models.isError && <p className="text-xs text-destructive">Could not load models for this key.</p>}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Backup model (optional): used once if the main model fails from overload, rate limits or timeouts before any work starts. Same AI key.</p>
              <Select value={fb || "none"} onValueChange={(v) => setFb(v === "none" ? "" : v)} disabled={!cred}>
                <SelectTrigger className="h-11 w-full [&>span]:truncate"><SelectValue placeholder="No backup" /></SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="none">No backup</SelectItem>{models.data?.filter((x) => x !== m).map((x) => <SelectItem className="break-all" key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="h-11 w-full" disabled={!cred || !m || saving} onClick={save}>{saving ? "Saving…" : "Use this model"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
