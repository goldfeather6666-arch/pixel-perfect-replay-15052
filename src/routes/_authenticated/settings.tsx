import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteCredential, listCredentials, saveCredential } from "@/lib/app.functions";
import { AI_PROVIDERS, providerName, type ProviderId } from "@/lib/providers";
import { McpConnections } from "@/components/McpConnections";
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
    onSuccess: () => {
      toast.success("Key verified and saved");
      setKey("");
      setLabel("");
      setModels("");
      setExtra("");
      qc.invalidateQueries({ queryKey: ["creds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meta = AI_PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="min-h-screen">
      <AppHeader><span className="text-sm text-muted-foreground">Keys & connections</span></AppHeader>
      <main className="mx-auto max-w-2xl space-y-8 p-4 sm:p-8">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Add a key</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keys are checked with the provider, encrypted, and never shown again. For GitHub, use a personal access token with <span className="font-mono">repo</span> access.
          </p>
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); saveM.mutate(); }}>
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  <SelectItem value="github">GitHub token</SelectItem>
                  <SelectItem value="supabase">Supabase access token</SelectItem>
                  <SelectItem value="vercel">Vercel token</SelectItem>
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
                <p className="text-xs text-muted-foreground">Comma-separated. Shown in the model picker even if the service doesn't list them.</p>
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
            <div className="space-y-1.5">
              <Label>Key</Label>
              <Input required type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={provider === "github" ? "ghp_... or github_pat_..." : provider === "supabase" ? "sbp_... (supabase.com → Account → Access Tokens)" : provider === "vercel" ? "vercel.com → Account Settings → Tokens" : meta?.hint} />
            </div>
            <Button disabled={saveM.isPending}>{saveM.isPending ? "Checking…" : "Verify & save"}</Button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Saved</h2>
          {creds.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {creds.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
          <ul className="space-y-2">
            {creds.data?.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-md border bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{providerName(c.provider)} · ••••{c.last4}{c.base_url ? ` · ${c.base_url}` : ""}</p>
                  {!!c.custom_models?.length && <p className="truncate text-xs text-muted-foreground">Models: {c.custom_models.join(", ")}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove"
                  onClick={async () => {
                    await del({ data: { id: c.id } });
                    qc.invalidateQueries({ queryKey: ["creds"] });
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <McpConnections />
      </main>
    </div>
  );
}
