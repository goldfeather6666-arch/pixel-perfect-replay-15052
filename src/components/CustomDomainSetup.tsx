import { useState } from "react";
import { transientRetry } from "@/lib/chunk-recovery";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe, Check, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCustomDomain, checkCustomDomain } from "@/lib/project-setup.functions";

export function CustomDomainSetup({ taskId, onSend }: { taskId: string; onSend?: (message: string) => void }) {
  const [domain, setDomain] = useState(""); const [saving, setSaving] = useState(false);
  const add = useServerFn(addCustomDomain); const check = useServerFn(checkCustomDomain);
  const q = useQuery({ queryKey: ["custom-domain", taskId], queryFn: () => check({ data: { taskId } }), refetchInterval: (query) => query.state.data?.state === "configured" ? 60000 : 15000, ...transientRetry, throwOnError: false });
  const d = q.data;
  return <section className="space-y-3 border-t pt-4">
    <h3 className="flex items-center gap-2 font-medium"><Globe className="h-4 w-4" /> Your own domain</h3>
    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
      <li>Enter the domain you own. We’ll add it to the selected Vercel website.</li>
      <li>At your domain provider, open DNS settings and enter the exact records shown below. Remove conflicting records for the same hostname.</li>
      <li>Keep this page open while DNS updates. Vercel is checked automatically; propagation can take up to 48 hours.</li>
      <li>Once verified, we’ll update the website address and database signup, sign-in and password-reset return links.</li>
    </ol>
    <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await add({ data: { taskId, domain } }); setDomain(""); await q.refetch(); toast.success("Domain added — checking DNS"); } catch { toast.error("Could not add the domain. Check ownership, linked website and account access."); } finally { setSaving(false); } }}>
      <Input aria-label="Custom domain" className="min-w-0 flex-1 basis-48" placeholder="www.yourdomain.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
      <Button disabled={saving || !domain.trim()} type="submit">Add & approve setup</Button>
    </form>
    <p className="text-xs text-muted-foreground">Approves domain linking and automatic website/auth settings sync after verification. DNS changes stay with your domain provider. No new deployment or secret rotation.</p>
    {q.isError && <p role="alert" className="text-xs text-destructive">Vercel could not be checked. Reconnect the selected account or try again.</p>}
    {d && <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="break-all text-sm font-medium">{d.domain} · {d.state === "configured" ? "Verified & settings synced" : d.state === "verified" ? "Verified · setup pending" : "Waiting for DNS"}</p><Button variant="ghost" size="icon" aria-label="Check domain again" title="Check domain again" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /></Button></div>
      {d.state === "pending" && <>{d.records.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">Type</th><th>Host/name</th><th>Value</th></tr></thead><tbody>{d.records.map((r, i) => <tr className="border-t" key={i}><td className="py-2 pr-3">{r.type}</td><td className="break-all pr-3">{r.name}</td><td className="break-all font-mono">{r.value}</td></tr>)}</tbody></table></div> : <p className="text-xs text-muted-foreground">Open Vercel → your project → Settings → Domains for the required DNS records.</p>}<a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">Open Vercel <ExternalLink className="h-3 w-3" /></a></>}
      {d.syncError && <p className="text-xs text-destructive">{d.syncError}</p>}
      {d.state === "configured" && <><p className="flex items-center gap-2 text-xs text-primary"><Check className="h-4 w-4" /> Website address and available auth settings synchronized.</p><p className="text-xs text-muted-foreground">{d.template.providerNotice} App changes may need an approved rebuild.</p>{onSend && <Button variant="outline" onClick={() => onSend(d.template.agentPrompt)}>Update app & review callbacks</Button>}</>}
      <p className="text-xs text-muted-foreground">Last checked {new Date(d.checkedAt).toLocaleTimeString()}</p>
    </div>}
  </section>;
}