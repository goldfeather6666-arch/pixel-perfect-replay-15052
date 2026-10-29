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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteCredential, listCredentials, saveCredential } from "@/lib/app.functions";
import { AI_PROVIDERS, providerName, type ProviderId } from "@/lib/providers";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Keys & connections — Forge" }, { name: "description", content: "Manage your AI provider keys and GitHub token." }] }),
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

  const saveM = useMutation({
    mutationFn: () =>
      save({ data: { provider, label: label || providerName(provider), key, base_url: provider === "compatible" ? baseUrl : null } }),
    onSuccess: () => {
      toast.success("Key verified and saved");
      setKey("");
      setLabel("");
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
                </SelectContent>
              </Select>
            </div>
            {provider === "compatible" && (
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input required placeholder="https://host/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Name (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={providerName(provider)} />
            </div>
            <div className="space-y-1.5">
              <Label>Key</Label>
              <Input required type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={provider === "github" ? "ghp_... or github_pat_..." : meta?.hint} />
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
                  <p className="font-mono text-xs text-muted-foreground">{providerName(c.provider)} · ••••{c.last4}</p>
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
      </main>
    </div>
  );
}
