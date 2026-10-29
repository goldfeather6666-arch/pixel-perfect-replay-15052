import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GitBranch, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSession, listBranches, listCredentials, listModels, listRepos, listSessions } from "@/lib/app.functions";
import { providerName } from "@/lib/providers";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Workspace — Forge" }, { name: "description", content: "Your coding agent tasks." }] }),
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

  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => fetchSessions() });
  const creds = useQuery({ queryKey: ["creds"], queryFn: () => fetchCreds() });
  const aiCreds = useMemo(() => creds.data?.filter((c) => c.provider !== "github") ?? [], [creds.data]);
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

  const createM = useMutation({
    mutationFn: () =>
      create({ data: { repo, base_branch: branch, credential_id: credId, model: manualModel || model, mode, title: "New task" } }),
    onSuccess: (id) => nav({ to: "/s/$id", params: { id } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = creds.data && aiCreds.length > 0 && hasGh;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-8 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border bg-card p-5">
          <h1 className="text-xl font-semibold">New task</h1>
          {creds.data && !ready ? (
            <div className="mt-4 text-sm text-muted-foreground">
              You need {aiCreds.length === 0 && "an AI key"}{aiCreds.length === 0 && !hasGh && " and "}{!hasGh && "a GitHub token"} first.{" "}
              <Link to="/settings" className="text-primary underline">Open settings</Link>
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); createM.mutate(); }}>
              <div className="space-y-1.5">
                <Label>Repository</Label>
                <Select value={repo} onValueChange={setRepo}>
                  <SelectTrigger><SelectValue placeholder={repos.isLoading ? "Loading repos…" : "Choose a repository"} /></SelectTrigger>
                  <SelectContent>{repos.data?.map((r) => <SelectItem key={r.full_name} value={r.full_name}>{r.full_name}</SelectItem>)}</SelectContent>
                </Select>
                {repos.error && <p className="text-xs text-destructive">{(repos.error as Error).message}</p>}
              </div>
              {repo && (
                <div className="space-y-1.5">
                  <Label>Start from branch</Label>
                  <Select value={branch} onValueChange={setBranch}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{branches.data?.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">The agent works on a fresh branch — your base branch is never touched.</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>AI key</Label>
                  <Select value={credId} onValueChange={(v) => { setCredId(v); setModel(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{aiCreds.map((c) => <SelectItem key={c.id} value={c.id}>{c.label} · {providerName(c.provider)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger><SelectValue placeholder={models.isLoading ? "Loading…" : "Choose model"} /></SelectTrigger>
                    <SelectContent>{models.data?.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>…or type a model ID</Label>
                <Input value={manualModel} onChange={(e) => setManualModel(e.target.value)} placeholder="e.g. claude-sonnet-4-5" />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["supervised", "autonomous"] as const).map((m) => (
                    <button type="button" key={m} onClick={() => setMode(m)}
                      className={`rounded-md border p-3 text-left text-sm ${mode === m ? "border-primary bg-accent" : "bg-background"}`}>
                      <span className="font-medium capitalize">{m}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{m === "supervised" ? "You approve every edit" : "Commits as it works"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Button disabled={!repo || !branch || !credId || !(model || manualModel) || createM.isPending} className="w-full">
                <Plus /> {createM.isPending ? "Creating branch…" : "Start task"}
              </Button>
            </form>
          )}
        </section>
        <aside>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Recent tasks</h2>
          {sessions.data?.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
          <ul className="space-y-2">
            {sessions.data?.map((s) => (
              <li key={s.id}>
                <Link to="/s/$id" params={{ id: s.id }} className="block rounded-md border bg-card p-3 hover:border-primary">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="mt-1 flex items-center gap-1 truncate font-mono text-xs text-muted-foreground"><GitBranch className="h-3 w-3" />{s.repo}</p>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  );
}
