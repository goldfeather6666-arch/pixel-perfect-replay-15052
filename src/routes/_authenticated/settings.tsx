import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Search, ShieldCheck, RefreshCw, ExternalLink } from "lucide-react";
import { TOKEN_LINKS, hasTokenLink } from "@/lib/token-links";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteCredential, listCredentials, saveCredential } from "@/lib/app.functions";
import { AI_PROVIDERS, providerName, type ProviderId } from "@/lib/providers";
import { McpConnections } from "@/components/McpConnections";
import { OwnServerCard } from "@/components/OwnServerCard";
import { OneClickConnect } from "@/components/OneClickConnect";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: pageMeta("Keys & connections — Forge", "Manage your AI provider keys, GitHub token and external tool connections.") }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listCredentials);
  const save = useServerFn(saveCredential);
  const del = useServerFn(deleteCredential);
  const creds = useQuery({ queryKey: ["creds"], queryFn: () => list() });

  const [provider, setProvider] = useState<ProviderId>("openai");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [extra, setExtra] = useState("");
  const [search, setSearch] = useState("");

  const saveM = useMutation({
    mutationFn: async () => {
      const custom = provider === "compatible";
      let extra_body: Record<string, unknown> | null = null;
      if (custom && extra.trim()) {
        try {
          const parsed = JSON.parse(extra);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
          extra_body = parsed;
        } catch {
          throw new Error('Extra options must be a JSON object, e.g. {"reasoning_effort":"low"}');
        }
      }
      return save({
        data: {
          provider,
          label: label || providerName(provider),
          key,
          base_url: custom ? baseUrl : null,
          custom_models: custom ? models.split(/[,\n]/).map((m) => m.trim()).filter(Boolean) : [],
          extra_body,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(r.totalModels ? `Key verified and saved · ${r.freeModels} of ${r.totalModels} models free` : "Key verified and saved");
      setKey("");
      setLabel("");
      setBaseUrl("");
      setModels("");
      setExtra("");
      qc.invalidateQueries({ queryKey: ["creds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meta = AI_PROVIDERS.find((p) => p.id === provider);
  const [tab, setTab] = useState<"ai" | "accounts" | "tools">("ai");
  const ACCOUNT = ["github", "supabase", "vercel"];
  const pickTab = (t: "ai" | "accounts" | "tools") => { setTab(t); if (t === "ai" && ACCOUNT.includes(provider)) setProvider("openai"); if (t === "accounts" && !ACCOUNT.includes(provider)) setProvider("github" as ProviderId); };
  const shown = creds.data?.filter((c) => (tab === "accounts") === ACCOUNT.includes(c.provider)).filter((c) => `${c.label} ${providerName(c.provider)} ${c.base_url ?? ""} ${c.last4}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="min-h-screen">
      <AppHeader><span className="text-sm text-muted-foreground">Settings</span></AppHeader>
      <main className="mx-auto max-w-4xl space-y-5 p-3 sm:space-y-7 sm:p-6 lg:p-8">
        <div className="flex gap-1 rounded-lg border bg-card p-1 text-sm" role="tablist">
          {([["ai", "AI models"], ["accounts", "Accounts"], ["tools", "Tools & skills"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => pickTab(k)} className={`flex-1 rounded-md px-3 py-2 ${tab === k ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
        </div>
        {tab === "tools" ? (
          <>
            <section className="rounded-lg border bg-card p-5">
              <h2 className="font-semibold">Skills</h2>
              <p className="mt-1 text-sm text-muted-foreground">Reusable instructions the agent follows, saved by you or imported from GitHub.</p>
              <Button asChild variant="secondary" size="sm" className="mt-3"><Link to="/skills">Manage skills</Link></Button>
            </section>
            <McpConnections />
            <OwnServerCard />
          </>
        ) : (<>
        <section className="panel rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><ShieldCheck className="size-5" /></div><div><h2 className="font-semibold tracking-tight">{tab === "ai" ? "Connect an AI provider" : "Connect an account"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tab === "ai" ? "Keys are verified, encrypted and never displayed again." : "Connect your own GitHub, Supabase and Vercel accounts. Each project can use its own selected accounts."}</p></div></div>
          {tab === "accounts" && <OneClickConnect />}
          <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); saveM.mutate(); }}>
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tab === "ai" ? AI_PROVIDERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>) : (<>
                    <SelectItem value="github">GitHub token</SelectItem>
                    <SelectItem value="supabase">Database (Supabase) access token</SelectItem>
                    <SelectItem value="vercel">Vercel token</SelectItem>
                  </>)}
                </SelectContent>
              </Select>
            </div>
            {provider === "compatible" && (
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input required placeholder="https://api.inceptionlabs.ai/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                <p className="text-xs text-muted-foreground">The address before /chat/completions.</p>
              </div>
            )}
            {provider === "compatible" && (
              <div className="space-y-1.5">
                <Label>Model names (optional)</Label>
                <Input placeholder="mercury-3, mercury-coder" value={models} onChange={(e) => setModels(e.target.value)} />
                <p className="text-xs text-muted-foreground">Comma-separated. Shown in the model picker even if the service doesn't list them. Models you host yourself are marked Free.</p>
              </div>
            )}
            {provider === "compatible" && (
              <div className="space-y-1.5">
                <Label>Extra request options (optional JSON)</Label>
                <Textarea rows={2} className="font-mono text-xs" placeholder='{"reasoning_effort": "low"}' value={extra} onChange={(e) => setExtra(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Name (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={providerName(provider)} />
            </div>
            {hasTokenLink(provider) && (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
                <Button asChild type="button" variant="outline" className="h-10 w-full sm:w-auto">
                  <a href={TOKEN_LINKS[provider].url} target="_blank" rel="noreferrer"><ExternalLink /> Get {providerName(provider)} token</a>
                </Button>
                <p className="text-xs text-muted-foreground">{TOKEN_LINKS[provider].steps}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Key</Label>
              <Input required type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={provider === "github" ? "ghp_... or github_pat_..." : provider === "supabase" ? "sbp_..." : provider === "vercel" ? "Paste your Vercel token" : meta?.hint} />
            </div>
            <Button className="h-11 w-full sm:w-auto" disabled={saveM.isPending || !key.trim() || (provider === "compatible" && !baseUrl.trim())}>{saveM.isPending ? "Verifying connection…" : "Verify & save connection"}</Button>
          </form>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold tracking-tight">{tab === "ai" ? "Your AI providers" : "Your connected accounts"}</h2><p className="mt-0.5 text-xs text-muted-foreground">{shown?.length ?? 0} connection{shown?.length === 1 ? "" : "s"} shown</p></div>
            <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search connections…" aria-label="Search connections" className="h-10 pl-9" /></div></div>
          {creds.isLoading && <div className="panel flex items-center gap-3 p-4 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Loading your connections…</div>}
          {creds.error && <div className="panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span>Could not load connections: {(creds.error as Error).message}</span><Button size="sm" variant="outline" onClick={() => void creds.refetch()}>Try again</Button></div>}
          {!creds.isLoading && !creds.error && shown?.length === 0 && <div className="panel p-6 text-center"><p className="text-sm font-medium">{search.trim() ? "No matching connections" : "Nothing connected yet"}</p><p className="mt-1 text-xs text-muted-foreground">{search.trim() ? "Try a different search term." : "Add a connection above to get started."}</p>{search.trim() && <Button className="mt-3" size="sm" variant="outline" onClick={() => setSearch("")}>Clear search</Button>}</div>}
          <ul className="space-y-2">{shown?.map((c) => <li key={c.id} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card/80 px-3 py-3 transition-colors hover:bg-accent/30 sm:px-4">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.label}</p><p className="truncate font-mono text-[11px] text-muted-foreground sm:text-xs">{providerName(c.provider)} · ••••{c.last4}{c.base_url ? ` · ${c.base_url}` : ""}</p>{!!c.custom_models?.length && <p className="truncate text-xs text-muted-foreground">Models: {c.custom_models.join(", ")}</p>}</div>
            <Button variant="ghost" size="icon" aria-label={`Remove ${c.label}`} onClick={async () => { if (!window.confirm(`Remove “${c.label}” from Forge? Existing tasks may need a replacement connection.`)) return; try { await del({ data: { id: c.id } }); await qc.invalidateQueries({ queryKey: ["creds"] }); toast.success("Connection removed"); } catch (error) { toast.error((error as Error).message); } }}><Trash2 className="size-4" /></Button>
          </li>)}</ul>
        </section>
        </>)}
      </main>
    </div>
  );
}
