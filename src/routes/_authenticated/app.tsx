import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GitBranch, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRepo, createSession, listBranches, listCredentials, listModels, listRepos, listSessions } from "@/lib/app.functions";
import { isAiProvider, providerName } from "@/lib/providers";
import { pageMeta } from "@/lib/page-meta";
import { taskRunStatus } from "@/lib/task-run-status";
import { DeployPanel } from "@/components/DeployPanel";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: pageMeta("Workspace — Forge", "Your coding agent tasks.") }),
  component: Dashboard,
});

function Dashboard() {
  const nav = useNavigate();
  const fetchSessions = useServerFn(listSessions);
  const fetchCreds = useServerFn(listCredentials);
  const fetchRepos = useServerFn(listRepos);
  const fetchBranches = useServerFn(listBranches);
  const fetchModels = useServerFn(listModels);
  const create = useServerFn(createSession);
  const makeRepo = useServerFn(createRepo);
  const [setupId, setSetupId] = useState<string | null>(null);
  const [setupConnections, setSetupConnections] = useState(true);

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => fetchSessions(),
    // Poll even when idle so runs started on another device become visible.
    refetchInterval: 3000,
  });
  const creds = useQuery({ queryKey: ["creds"], queryFn: () => fetchCreds() });
  const aiCreds = useMemo(() => creds.data?.filter((c) => isAiProvider(c.provider)) ?? [], [creds.data]);
  const hasGh = creds.data?.some((c) => c.provider === "github");
  const repos = useQuery({ queryKey: ["repos"], queryFn: () => fetchRepos(), enabled: !!hasGh });

  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [credId, setCredId] = useState("");
  const [model, setModel] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [mode, setMode] = useState<"supervised" | "autonomous">("supervised");

  const branches = useQuery({ queryKey: ["branches", repo], queryFn: () => fetchBranches({ data: { repo } }), enabled: !!repo });
  const models = useQuery({ queryKey: ["models", credId], queryFn: () => fetchModels({ data: { id: credId } }), enabled: !!credId, retry: false });

  useEffect(() => {
    const r = repos.data?.find((x) => x.full_name === repo);
    if (r) setBranch(r.default_branch);
  }, [repo, repos.data]);
  useEffect(() => {
    if (!credId && aiCreds[0]) setCredId(aiCreds[0].id);
  }, [aiCreds, credId]);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrivate, setNewPrivate] = useState(true);
  const qc = useQueryClient();
  const createRepoM = useMutation({
    mutationFn: () => makeRepo({ data: { name: newName.trim(), description: newDesc, private: newPrivate } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["repos"] });
      await qc.refetchQueries({ queryKey: ["repos"] });
      setRepo(r.full_name);
      setBranch(r.default_branch);
      setShowNew(false);
      setNewName("");
      setNewDesc("");
      toast.success(`Created ${r.full_name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createM = useMutation({
    mutationFn: () =>
      create({ data: { repo, base_branch: branch, credential_id: credId, model: manualModel || model, mode, title: "New task" } }),
    onSuccess: (id) => setupConnections ? setSetupId(id) : nav({ to: "/s/$id", params: { id } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = creds.data && aiCreds.length > 0 && hasGh;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-3 pb-10 sm:p-8 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 rounded-lg border bg-card p-4 sm:p-5">
          <h1 className="text-xl font-semibold">New task</h1>
          {creds.data && !ready ? (
            <div className="mt-4 text-sm text-muted-foreground">
              You need {aiCreds.length === 0 && "an AI key"}{aiCreds.length === 0 && !hasGh && " and "}{!hasGh && "a GitHub token"} first.{" "}
              <Link to="/settings" className="text-primary underline">Open settings</Link>
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); createM.mutate(); }}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Repository</Label>
                  <button type="button" className="shrink-0 py-2 text-sm text-primary underline" onClick={() => setShowNew((v) => !v)}>
                    {showNew ? "Use existing repo" : "+ New repository"}
                  </button>
                </div>
                {showNew ? (
                  <div className="space-y-2 rounded-md border bg-background p-3">
                    <Input className="h-11 text-base sm:text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="my-new-project" />
                    <Input className="h-11 text-base sm:text-sm" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Short description (optional)" />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} /> Private
                    </label>
                    <Button type="button" variant="secondary" size="sm" disabled={!newName.trim() || createRepoM.isPending} onClick={() => createRepoM.mutate()}>
                      {createRepoM.isPending ? "Creating…" : "Create on GitHub"}
                    </Button>
                    <p className="text-xs text-muted-foreground">Creates an empty repo with a README. Then describe what to build and the agent sets it up.</p>
                  </div>
                ) : (
                  <Select value={repo} onValueChange={setRepo}>
                    <SelectTrigger className="h-11 w-full min-w-0 [&>span]:truncate [&>span]:text-left"><SelectValue placeholder={repos.isLoading ? "Loading repos…" : "Choose a repository"} /></SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">{repos.data?.map((r) => <SelectItem key={r.full_name} value={r.full_name}>{r.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {repos.error && <p className="text-xs text-destructive">{(repos.error as Error).message}</p>}
              </div>
              {repo && (
                <div className="space-y-1.5">
                  <Label>Start from branch</Label>
                  <Select value={branch} onValueChange={setBranch}>
                    <SelectTrigger className="h-11 w-full min-w-0 [&>span]:truncate [&>span]:text-left"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">{branches.data?.map((b) => <SelectItem className="break-all" key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The agent works on a fresh branch — your base branch is never touched.</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>AI key</Label>
                  <Select value={credId} onValueChange={(v) => { setCredId(v); setModel(""); }}>
                    <SelectTrigger className="h-11 w-full min-w-0 [&>span]:truncate [&>span]:text-left"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">{aiCreds.map((c) => <SelectItem className="break-all" key={c.id} value={c.id}>{c.label} · {providerName(c.provider)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="h-11 w-full min-w-0 [&>span]:truncate [&>span]:text-left"><SelectValue placeholder={models.isLoading ? "Loading…" : "Choose model"} /></SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">{models.data?.map((m) => <SelectItem className="break-all" key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>…or type a model ID</Label>
                <Input className="h-11 text-base sm:text-sm" value={manualModel} onChange={(e) => setManualModel(e.target.value)} placeholder="e.g. claude-sonnet-4-5" />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["supervised", "autonomous"] as const).map((m) => (
                    <button type="button" key={m} onClick={() => setMode(m)}
                      className={`min-w-0 rounded-md border p-3 text-left text-sm ${mode === m ? "border-primary bg-accent" : "bg-background"}`}>
                      <span className="font-medium capitalize">{m}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{m === "supervised" ? "You approve every edit" : "Commits as it works"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={setupConnections} onChange={(e) => setSetupConnections(e.target.checked)} /> Set up database & Vercel before starting</label>
              <Button disabled={!repo || !branch || !credId || !(model || manualModel) || createM.isPending || !!setupId} className="h-12 w-full text-base">
                <Plus /> {createM.isPending ? "Creating branch…" : "Start task"}
              </Button>
            </form>
          )}
        </section>
        <aside className="order-first min-w-0 lg:order-last">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Your tasks</h2>
          {sessions.data?.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
          <ul className="space-y-2">
            {sessions.data?.map((s) => {
              const status = taskRunStatus(s);
              const live = status === "cloud" || status === "browser";
              return (
                <li key={s.id}>
                  <Link to="/s/$id" params={{ id: s.id }} className="block rounded-md border bg-card p-3 hover:border-primary">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="mt-1 flex items-center gap-1 truncate font-mono text-xs text-muted-foreground"><GitBranch className="h-3 w-3" />{s.repo}</p>
                    {live && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">
                        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
                        {status === "cloud" ? "Running in the cloud" : "Running in browser"}
                      </p>
                    )}
                    {!live && <p className={`mt-2 text-xs ${status === "stale" ? "text-destructive" : "text-muted-foreground"}`}>{status === "stale" ? "No recent update" : "Not running"}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </main>
      <Dialog open={!!setupId} onOpenChange={(open) => { if (!open && setupId) void nav({ to: "/s/$id", params: { id: setupId } }); }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto p-4">
          <DialogTitle>Connect your new project</DialogTitle>
          <DialogDescription>Use existing accounts or connect once. Public settings sync to Vercel production and previews; private keys never go into GitHub.</DialogDescription>
          {setupId && <DeployPanel id={setupId} />}
          <Button onClick={() => { if (setupId) void nav({ to: "/s/$id", params: { id: setupId } }); }}>Continue to task</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
