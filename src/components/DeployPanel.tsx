import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Database, ExternalLink, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  applyMigrations, getDeployments, getIntegrations, getMigrationStatus, linkSupabase, linkVercel, listSupabaseOptions, listVercelProjects,
} from "@/lib/integrations.functions";

const REGIONS = ["us-east-1", "us-west-1", "eu-central-1", "eu-west-2", "ap-southeast-1", "ap-south-1", "ap-northeast-1", "sa-east-1"];
const trig = "h-11 w-full min-w-0 [&>span]:truncate [&>span]:text-left";

export function DeployPanel({ id }: { id: string }) {
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ["integrations", id], queryFn: useServerFn(getIntegrations).bind(null, { data: { id } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations", id] });
  if (!info.data) return <p className="p-4 text-sm text-muted-foreground">{info.error ? (info.error as Error).message : "Loading…"}</p>;
  const d = info.data;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-4">
      <SupabaseCard id={id} has={d.hasSupabase} linked={d.supabase_ref} onChange={refresh} />
      <VercelCard id={id} has={d.hasVercel} linked={d.vercel_project_id} onChange={refresh} />
      {d.supabase_ref && d.vercel_project_id && (
        <p className="text-xs text-muted-foreground">Linked together: your database address and public key are added to the Vercel project automatically.</p>
      )}
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">{icon}{title}</h2>
      {children}
    </section>
  );
}

function NeedToken({ name }: { name: string }) {
  return <p className="text-sm text-muted-foreground">Add a {name} token in <Link to="/settings" className="text-primary underline">Settings</Link> to connect.</p>;
}

function SupabaseCard({ id, has, linked, onChange }: { id: string; has: boolean; linked: string | null; onChange: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const opts = useQuery({ queryKey: ["sb-opts"], queryFn: useServerFn(listSupabaseOptions), enabled: has && !linked });
  const link = useServerFn(linkSupabase);
  const status = useQuery({ queryKey: ["migr", id, linked], queryFn: useServerFn(getMigrationStatus).bind(null, { data: { id } }), enabled: !!linked, refetchInterval: 15000 });
  const applyFn = useServerFn(applyMigrations);
  const linkM = useMutation({
    mutationFn: (v: Parameters<typeof link>[0]["data"]) => link({ data: v }),
    onSuccess: () => { onChange(); toast.success("Database updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const applyM = useMutation({
    mutationFn: () => applyFn({ data: { id } }),
    onSuccess: (r) => {
      status.refetch();
      if (r.error) toast.error(`${r.error.file}: ${r.error.message}`);
      else toast.success(r.applied.length ? `Applied ${r.applied.length} change(s)` : "Nothing to apply");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card icon={<Database className="h-4 w-4 shrink-0" />} title="Supabase database">
      {!has ? <NeedToken name="Supabase" /> : linked ? (
        <div className="space-y-3 text-sm">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate font-mono text-xs">{linked}{status.data?.dbStatus ? ` · ${status.data.dbStatus.toLowerCase().replace(/_/g, " ")}` : ""}</span>
            <Button size="sm" variant="ghost" onClick={() => linkM.mutate({ id, unlink: true })}>Unlink</Button>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="font-medium">Waiting to apply: {status.data?.pending.length ?? "…"}</p>
            {status.data?.pending.map((p) => <p key={p} className="truncate font-mono text-xs text-muted-foreground">{p.replace("supabase/migrations/", "")}</p>)}
            <p className="mt-2 text-xs text-muted-foreground">Applied: {status.data?.applied.length ?? 0}. In Autonomous mode the agent applies these itself; in Supervised mode, approve the files in Changes, then tap below.</p>
            <Button className="mt-3 h-11 w-full" disabled={!status.data?.pending.length || applyM.isPending} onClick={() => applyM.mutate()}>
              {applyM.isPending ? "Applying…" : "Apply to database"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <ModeSwitch mode={mode} setMode={setMode} />
          {opts.error && <p className="text-xs text-destructive">{(opts.error as Error).message}</p>}
          {mode === "existing" ? (
            <>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger className={trig}><SelectValue placeholder={opts.isLoading ? "Loading…" : "Choose a project"} /></SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">{opts.data?.projects.map((p) => <SelectItem key={p.ref} value={p.ref}>{p.name} · {p.region}</SelectItem>)}</SelectContent>
              </Select>
              <Button className="h-11 w-full" disabled={!pick || linkM.isPending} onClick={() => linkM.mutate({ id, ref: pick })}>Link project</Button>
            </>
          ) : (
            <>
              <Input className="h-11 text-base sm:text-sm" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={org} onValueChange={setOrg}>
                  <SelectTrigger className={trig}><SelectValue placeholder="Organization" /></SelectTrigger>
                  <SelectContent>{opts.data?.orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger className={trig}><SelectValue /></SelectTrigger>
                  <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="h-11 w-full" disabled={!name.trim() || !org || linkM.isPending} onClick={() => linkM.mutate({ id, create: { name: name.trim(), orgId: org, region } })}>
                {linkM.isPending ? "Creating…" : "Create & link"}
              </Button>
              <p className="text-xs text-muted-foreground">New projects take about 2 minutes to start.</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function VercelCard({ id, has, linked, onChange }: { id: string; has: boolean; linked: string | null; onChange: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [pick, setPick] = useState("");
  const projects = useQuery({ queryKey: ["vc-projects"], queryFn: useServerFn(listVercelProjects), enabled: has && !linked });
  const link = useServerFn(linkVercel);
  const deps = useQuery({ queryKey: ["deps", id, linked], queryFn: useServerFn(getDeployments).bind(null, { data: { id } }), enabled: !!linked, refetchInterval: 10000 });
  const linkM = useMutation({
    mutationFn: (v: Parameters<typeof link>[0]["data"]) => link({ data: v }),
    onSuccess: () => { onChange(); toast.success("Website updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const latest = deps.data?.deployments[0];
  const color = latest?.state === "READY" ? "text-primary" : latest?.state === "ERROR" ? "text-destructive" : "text-muted-foreground";

  return (
    <Card icon={<Rocket className="h-4 w-4 shrink-0" />} title="Vercel website">
      {!has ? <NeedToken name="Vercel" /> : linked ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-medium ${color}`}>{latest ? latest.state.toLowerCase() : deps.isLoading ? "checking…" : "no deploy for this task yet"}</span>
            <Button size="sm" variant="ghost" onClick={() => linkM.mutate({ id, unlink: true })}>Unlink</Button>
          </div>
          {latest?.state === "READY" && (
            <Button asChild className="h-11 w-full"><a href={latest.url} target="_blank" rel="noreferrer"><ExternalLink /> Open preview</a></Button>
          )}
          {deps.data?.log && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 font-mono text-[11px]">{deps.data.log}</pre>}
          <p className="text-xs text-muted-foreground">Every commit on this task deploys a private preview automatically. If a deploy fails, the agent reads the error and fixes it.</p>
          {deps.error && <p className="text-xs text-destructive">{(deps.error as Error).message}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <ModeSwitch mode={mode} setMode={setMode} />
          {projects.error && <p className="text-xs text-destructive">{(projects.error as Error).message}</p>}
          {mode === "existing" ? (
            <>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger className={trig}><SelectValue placeholder={projects.isLoading ? "Loading…" : "Choose a project"} /></SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.repo ? ` · ${p.repo}` : ""}</SelectItem>)}</SelectContent>
              </Select>
              <Button className="h-11 w-full" disabled={!pick || linkM.isPending} onClick={() => linkM.mutate({ id, projectId: pick })}>Link project</Button>
            </>
          ) : (
            <>
              <Button className="h-11 w-full" disabled={linkM.isPending} onClick={() => linkM.mutate({ id, create: true })}>
                {linkM.isPending ? "Creating…" : "Create a Vercel project for this repo"}
              </Button>
              <p className="text-xs text-muted-foreground">Needs the Vercel GitHub app installed with access to this repo.</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function ModeSwitch({ mode, setMode }: { mode: "existing" | "new"; setMode: (m: "existing" | "new") => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["existing", "new"] as const).map((m) => (
        <button key={m} type="button" onClick={() => setMode(m)} className={`h-11 rounded-md border text-sm ${mode === m ? "border-primary bg-accent" : "bg-background"}`}>
          {m === "existing" ? "Use existing" : "Create new"}
        </button>
      ))}
    </div>
  );
}
