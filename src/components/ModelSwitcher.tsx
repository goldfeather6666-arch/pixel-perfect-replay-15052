import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cpu } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCredentials, listModels, updateSession } from "@/lib/app.functions";
import { aiConnection } from '@/lib/team-models';
import type { Credential } from '@/lib/providers';

/** Lets the user switch the AI key/provider and model of an ongoing task; applies from the next message. */
export function ModelSwitcher({ id, credentialId, model, fallbackModel, profile = "auto", codingModel, reviewerModel, codingCredentialId, reviewerCredentialId, disabled }: { id: string; credentialId: string | null; model: string; fallbackModel?: string | null; profile?: string; codingModel?: string | null; reviewerModel?: string | null; codingCredentialId?: string | null; reviewerCredentialId?: string | null; disabled?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cred, setCred] = useState(credentialId ?? "");
  const [m, setM] = useState(model);
  const [saving, setSaving] = useState(false);
  const [fb, setFb] = useState(fallbackModel ?? "");
  const [prof, setProf] = useState(profile);
  const [cm, setCm] = useState(codingModel ?? "");
  const [rm, setRm] = useState(reviewerModel ?? "");
  const [cc, setCc] = useState(codingCredentialId ?? '');
  const [rc, setRc] = useState(reviewerCredentialId ?? '');
  const fetchCreds = useServerFn(listCredentials);
  const fetchModels = useServerFn(listModels);
  const update = useServerFn(updateSession);
  const creds = useQuery({ queryKey: ["credentials"], queryFn: () => fetchCreds(), enabled: open });
  const models = useQuery({ queryKey: ["models", cred], queryFn: () => fetchModels({ data: { id: cred } }), enabled: open && !!cred, retry: false });
  useEffect(() => { if (open) { setCred(credentialId ?? ""); setM(model); setFb(fallbackModel ?? ""); setProf(profile); setCm(codingModel ?? ""); setRm(reviewerModel ?? ""); setCc(codingCredentialId ?? ''); setRc(reviewerCredentialId ?? ''); } }, [open, credentialId, model, fallbackModel, profile, codingModel, reviewerModel, codingCredentialId, reviewerCredentialId]);

  async function save() {
    if (!cred || !m) return;
    setSaving(true);
    try {
      await update({ data: { id, credential_id: cred, model: m, fallback_model: fb && fb !== m ? fb : null, reasoning_profile: prof as "auto", coding_model: cm && (cc || cm !== m) ? cm : null, reviewer_model: rm && (rc || rm !== m) ? rm : null, coding_credential_id: cc || null, reviewer_credential_id: rc || null } });
      await qc.invalidateQueries({ queryKey: ["session", id] });
      toast.success('AI team updated');
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch model");
    } finally { setSaving(false); }
  }

  return (
    <>
      <Button variant="outline" type="button" disabled={disabled} title={disabled ? "Stop the current run to switch model" : "AI team settings"}
        onClick={() => setOpen(true)}
        className="flex h-auto min-w-0 max-w-[9rem] shrink items-center gap-1 rounded px-2 py-0.5 font-mono">
        <Cpu className="h-3 w-3 shrink-0" /><span className="truncate">{model || "model"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI team · APIs & models</DialogTitle>
            <DialogDescription>Lead · coding · review. Changes apply to the next run. Connected API usage may incur provider charges.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Lead agent</h3>
            <Select value={cred} onValueChange={(v) => { setCred(v); setM(""); setFb(''); if (!cc) setCm(''); if (!rc) setRm(''); }}>
              <SelectTrigger aria-label="Lead API connection" className="h-11 w-full [&>span]:truncate"><SelectValue placeholder={creds.isLoading ? "Loading…" : "Choose AI key"}>{cred ? (creds.data?.find(c=>c.id===cred)?.label || 'Selected API connection') : undefined}</SelectValue></SelectTrigger>
              <SelectContent>{creds.data?.filter(c => aiConnection(c.provider)).map((c) => <SelectItem key={c.id} value={c.id}>{c.label || c.provider} · {c.provider} ···{c.last4}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={m} onValueChange={setM} disabled={!cred}>
              <SelectTrigger aria-label="Lead model" className="h-11 w-full [&>span]:truncate"><SelectValue placeholder={models.isLoading ? "Loading…" : "Choose model"}>{m || undefined}</SelectValue></SelectTrigger>
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
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Thinking level. Auto picks Speed for small fixes, Deep for risky work. Only settings your model supports are sent.</p>
              <Select value={prof} onValueChange={setProf}>
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{[["auto", "Auto"], ["speed", "Speed"], ["balanced", "Balanced"], ["deep", "Deep"]].map(([v, l]) => <SelectItem key={v} value={v ?? ''}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <RoleModel label="Coding agents" leadCredential={cred} credential={cc} model={cm} credentials={creds.data ?? []} open={open} onCredential={setCc} onModel={setCm} />
            <RoleModel label="Review agents" leadCredential={cred} credential={rc} model={rm} credentials={creds.data ?? []} open={open} onCredential={setRc} onModel={setRm} />
            <Button className="h-11 w-full" disabled={!cred || !m || saving || disabled || (!!cc && !cm) || (!!rc && !rm)} onClick={save}>{saving ? "Saving…" : "Save AI team"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoleModel({ label, leadCredential, credential, model, credentials, open, onCredential, onModel }: { label:string; leadCredential:string; credential:string; model:string; credentials:Credential[]; open:boolean; onCredential:(v:string)=>void; onModel:(v:string)=>void }) {
  const fetchModels = useServerFn(listModels);
  const id = credential || leadCredential;
  const models = useQuery({queryKey:['models',id],queryFn:()=>fetchModels({data:{id}}),enabled:open && !!id,retry:false});
  return <div className="space-y-2 border-t pt-3">
    <h3 className="text-sm font-medium">{label}</h3>
    <Select value={credential || 'inherit'} onValueChange={v=>{onCredential(v==='inherit'?'':v);onModel('');}}>
      <SelectTrigger aria-label={`${label} API connection`} className="h-11 w-full [&>span]:truncate"><SelectValue>{credential ? (credentials.find(c=>c.id===credential)?.label || 'Selected API connection') : 'Lead API connection'}</SelectValue></SelectTrigger>
      <SelectContent><SelectItem value="inherit">Lead API connection</SelectItem>{credentials.filter(c=>aiConnection(c.provider)).map(c=><SelectItem value={c.id} key={c.id}>{c.label || c.provider} · {c.provider} ···{c.last4}</SelectItem>)}</SelectContent>
    </Select>
    <Select value={model || 'inherit'} onValueChange={v=>onModel(v==='inherit'?'':v)} disabled={!id}>
      <SelectTrigger aria-label={`${label} model`} className="h-11 w-full [&>span]:truncate"><SelectValue>{model || (credential ? 'Choose model' : 'Lead model')}</SelectValue></SelectTrigger>
      <SelectContent className="max-w-[calc(100vw-2rem)]">{!credential && <SelectItem value="inherit">Lead model</SelectItem>}{models.data?.map(m=><SelectItem key={m} value={m} className="break-all">{m}</SelectItem>)}</SelectContent>
    </Select>
    {models.isError && <p role="alert" className="text-xs text-destructive">Could not load models for this connection.</p>}
  </div>;
}
