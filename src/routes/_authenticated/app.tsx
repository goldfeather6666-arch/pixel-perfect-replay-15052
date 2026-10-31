import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AUTONOMY, AUTONOMY_LABEL, type Autonomy } from "@/lib/engine/autonomy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, Bug, Cloud, FolderGit2, GitBranch, Layers, LayoutTemplate, Plus, Rocket, ShieldCheck } from "lucide-react";

const PRESETS = [
  { title: "Landing page", hint: "Modern, animated", icon: LayoutTemplate, prompt: "Build a modern, responsive, animated landing page for this project. Match the existing stack, keep it mobile-friendly, then run deployment_preflight." },
  { title: "Fix the build", hint: "Repair failures", icon: Bug, prompt: "Run the project's typecheck, tests and build in the sandbox. Fix every failure at its root cause and re-run until all pass. Report what was broken." },
  { title: "Security review", hint: "Find & fix risks", icon: ShieldCheck, prompt: "/review Audit this repository for security issues (secrets, auth, injection, unsafe data access). List findings by severity with file references." },
  { title: "Full-stack app", hint: "Auth + database", icon: Layers, prompt: "/plan Plan a full-stack app in this repo with sign-in, a database with migrations under supabase/migrations, and deployable pages. Show the plan before building." },
];
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRepo, createSession, listBranches, listCredentials, listModels, listRepos, listSessions } from "@/lib/app.functions";
import { isAiProvider, providerName } from "@/lib/providers";
import { pageMeta } from "@/lib/page-meta";
import { taskRunStatus } from "@/lib/task-run-status";
import { WorkSplitPanel } from "@/components/WorkSplitPanel";
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
  const [teamPrompt, setTeamPrompt] = useState<string | null>(null);
  const [manualModel, setManualModel] = useState("");
  const [mode, setMode] = useState<Autonomy>("supervised");

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
    onSuccess: (id) => { if (teamPrompt) sessionStorage.setItem(`forge:draft:${id}`, teamPrompt); return setupConnections ? setSetupId(id) : nav({ to: "/s/$id", params: { id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = creds.data && aiCreds.length > 0 && hasGh;
  const stats = useMemo(() => {
    const list = sessions.data ?? [];
    const st = list.map((s) => taskRunStatus(s));
    return {
      total: list.length,
      cloud: st.filter((x) => x === "cloud").length,
      live: st.filter((x) => x === "cloud" || x === "browser").length,
      stale: st.filter((x) => x === "stale").length,
      repos: new Set(list.map((s) => s.repo)).size,
    };
  }, [sessions.data]);
  const [preset, setPreset] = useState<string | null>(null);
  const [q, setQ] = useState("");

  return (
    <div className="bg-aurora min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-6xl px-3 pt-5 sm:px-8 sm:pt-8">
        <p className="hud-label">Command center</p>
        <h1 className="text-gradient mt-1 text-2xl font-semibold sm:text-3xl">Ship code with your agents</h1>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {([
            ["Active runs", stats.live, Activity, stats.live > 0],
            ["In the cloud", stats.cloud, Cloud, stats.cloud > 0],
            ["Tasks", stats.total, Layers, false],
            ["Repositories", stats.repos, FolderGit2, false],
          ] as const).map(([label, v, Icon, hot]) => (
            <div key={label} className={`panel relative overflow-hidden p-3 sm:p-4 ${hot ? "shadow-glow" : ""}`}>
              <div className="flex items-center justify-between"><span className="hud-label">{label}</span><Icon className={`h-4 w-4 ${hot ? "text-primary" : "text-muted-foreground"}`} /></div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums sm:text-3xl">{sessions.isLoading ? "—" : v}</p>
              {hot && <span className="absolute bottom-0 left-0 h-0.5 w-full animate-pulse bg-primary" />}
            </div>
          ))}
        </div>
        {stats.stale > 0 && <p className="mt-2 text-xs text-destructive">{stats.stale} task{stats.stale > 1 ? "s" : ""} stopped reporting — open to resume.</p>}
      </div>
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-3 pb-10 sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel min-w-0 p-4 sm:p-6">
          <div className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">New task</h2></div>
          {ready && (
            <div className="mt-4">
              <p className="hud-label mb-2">Quick start</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRESETS.map((p) => (
                  <button key={p.title} type="button" onClick={() => { const on = preset === p.title; setPreset(on ? null : p.title); setTeamPrompt(on ? null : p.prompt); }}
                    className={`min-w-0 rounded-lg border p-3 text-left transition-colors hover:border-primary ${preset === p.title ? "border-primary bg-accent" : "bg-background/60"}`}>
                    <p.icon className="h-4 w-4 text-primary" />
                    <span className="mt-2 block truncate text-sm font-medium">{p.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.hint}</span>
                  </button>
                ))}
              </div>
              {preset && <p className="mt-2 text-xs text-muted-foreground">“{preset}” will be your first message — edit it before sending.</p>}
            </div>
          )}
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
                <Label>Autonomy level</Label>
                <div className="grid grid-cols-2 gap-2">
                  {AUTONOMY.map((m) => (
                    <button type="button" key={m} onClick={() => setMode(m)}
                      className={`min-w-0 rounded-md border p-3 text-left text-sm ${mode === m ? "border-primary bg-accent" : "bg-background"}`}>
                      <span className="font-medium">{AUTONOMY_LABEL[m].title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{AUTONOMY_LABEL[m].hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <WorkSplitPanel credId={credId} model={manualModel || model} repo={repo} onPrompt={setTeamPrompt} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={setupConnections} onChange={(e) => setSetupConnections(e.target.checked)} /> Set up database & Vercel before starting</label>
              <Button disabled={!repo || !branch || !credId || !(model || manualModel) || createM.isPending || !!setupId} className="h-12 w-full text-base">
                <Plus /> {createM.isPending ? "Creating branch…" : "Start task"}
              </Button>
            </form>
          )}
        </section>
        <aside className="order-first min-w-0 lg:order-last">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="hud-label">Your tasks</h2>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" aria-label="Filter tasks"
              className="h-8 w-32 rounded-md border bg-card/70 px-2 text-xs outline-none focus:border-primary" />
          </div>
          {sessions.data?.length === 0 && <div className="panel p-6 text-center text-sm text-muted-foreground">No tasks yet — start one with a quick preset.</div>}
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
            {sessions.data?.filter((s) => `${s.title} ${s.repo}`.toLowerCase().includes(q.toLowerCase())).map((s) => {
              const status = taskRunStatus(s);
              const live = status === "cloud" || status === "browser";
              return (
                <li key={s.id}>
                  <Link to="/s/$id" params={{ id: s.id }} className={`panel grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 transition-colors hover:border-primary ${live ? "border-primary/50" : ""}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${live ? "animate-pulse bg-primary" : status === "stale" ? "bg-destructive" : "bg-muted-foreground/40"}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="mt-1 flex items-center gap-1 truncate font-mono text-xs text-muted-foreground"><GitBranch className="h-3 w-3 shrink-0" /><span className="truncate">{s.repo}</span></span>
                      <span className={`mt-1.5 block text-[11px] ${live ? "text-primary" : status === "stale" ? "text-destructive" : "text-muted-foreground"}`}>
                        {status === "cloud" ? "Running in the cloud" : status === "browser" ? "Running in browser" : status === "stale" ? "No recent update" : "Idle"}
                      </span>
                    </span>
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
