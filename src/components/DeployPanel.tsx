import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Database, ExternalLink, Rocket } from "lucide-react";
import { saveCredential } from "@/lib/app.functions";
import { ConnectSyncCard } from "@/components/ProjectHealth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  applyMigrations, getDeployments, getIntegrations, getMigrationStatus, identifyAccounts, linkSupabase, linkVercel, listSupabaseOptions, listVercelProjects, syncDeployEnv, saveDatabaseSettings, setTaskAccount,
} from "@/lib/integrations.functions";

const REGIONS = ["us-east-1", "us-west-1", "eu-central-1", "eu-west-2", "ap-southeast-1", "ap-south-1", "ap-northeast-1", "sa-east-1"];
const trig = "h-11 w-full min-w-0 [&>span]:truncate [&>span]:text-left";

export function DeployPanel({ id, onSend }: { id: string; onSend?: (prompt: string) => void }) {
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ["integrations", id], queryFn: useServerFn(getIntegrations).bind(null, { data: { id } }) });
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["integrations", id] }),
    qc.invalidateQueries({ queryKey: ["session", id] }),
    qc.invalidateQueries({ queryKey: ["deps", id] }),
    qc.invalidateQueries({ queryKey: ["migr", id] }),
  ]);
  if (!info.data) return <p className="p-4 text-sm text-muted-foreground">{info.error ? (info.error as Error).message : "Loading…"}</p>;
  const d = info.data;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-4">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Put your app online</h2>
        <p className="mt-1 text-sm text-muted-foreground">Both are optional and free to start. Connect them once; every task after that is set up in one tap.</p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center gap-2"><StepBadge n={1} done={d.hasSupabase} /> Connect Supabase <span className="text-muted-foreground">(database)</span></li>
          <li className="flex items-center gap-2"><StepBadge n={2} done={!!d.supabase_ref} /> Choose a database for this task</li>
          <li className="flex items-center gap-2"><StepBadge n={3} done={d.hasVercel} /> Connect Vercel <span className="text-muted-foreground">(website)</span></li>
          <li className="flex items-center gap-2"><StepBadge n={4} done={!!d.vercel_project_id} /> Choose a website for this task</li>
        </ul>
      </section>
      <ConnectSyncCard id={id} {...(onSend ? { onSend } : {})} />
      <SameAccountWarning onRenamed={refresh} />
      <AccountsCard id={id} options={d.accountOptions} active={d.activeAccounts} onChange={() => { refresh(); qc.invalidateQueries({ queryKey: ["sb-opts", id] }); qc.invalidateQueries({ queryKey: ["vc-projects", id] }); }} />
      <SupabaseCard key={`sb-${d.activeAccounts.supabase}`} account={d.activeAccounts.supabase} id={id} has={d.hasSupabase} linked={d.supabase_ref} onChange={refresh} />
      {d.supabase_ref && <DatabaseKeys id={id} saved={d.hasDatabaseSettings} privileged={d.hasServiceRoleKey} onChange={refresh} />}
      <VercelCard key={`vc-${d.activeAccounts.vercel}`} options={d.accountOptions.filter((o) => o.provider === "vercel")} account={d.activeAccounts.vercel} dbLinked={!!d.supabase_ref} id={id} has={d.hasVercel} linked={d.vercel_project_id} onChange={refresh} />
      {d.supabase_ref && d.vercel_project_id && (
        <p className="text-xs text-muted-foreground">Linked together: your database address and public key are added to the Vercel project automatically.</p>
      )}
    </div>
  );
}

type AccountOption = { id: string; provider: string; label: string; last4: string };

/** Tells the user when two saved tokens are really the same Vercel/Supabase account (they would list identical projects). */
function SameAccountWarning({ onRenamed }: { onRenamed: () => void }) {
  const q = useQuery({ queryKey: ["account-identities"], queryFn: useServerFn(identifyAccounts), staleTime: 5 * 60_000 });
  const renamed = q.data?.renamed;
  useEffect(() => { if (renamed) onRenamed(); }, [renamed]); // eslint-disable-line react-hooks/exhaustive-deps
  const dups = q.data?.duplicates ?? [];
  const broken = (q.data?.accounts ?? []).filter((a) => !a.reachable);
  if (!dups.length && !broken.length) return null;
  return (
    <section role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
      {dups.map((g) => (
        <p key={g.provider + g.name} className="mb-2">
          <span className="font-semibold">Same {g.provider === "vercel" ? "Vercel" : "Supabase"} account saved twice.</span>{" "}
          Tokens {g.last4.map((l) => `···${l}`).join(" and ")} both belong to <span className="font-medium">{g.name}</span>, so switching between them shows the same projects.
          To use another account: sign out of {g.provider === "vercel" ? "Vercel" : "Supabase"}, sign in to the other account, create a token there, then remove the duplicate in Settings → Accounts.
        </p>
      ))}
      {broken.map((a) => <p key={a.id} className="text-xs">Token ···{a.last4} ({a.label}) no longer works. Remove it in Settings → Accounts and add a fresh one.</p>)}
    </section>
  );
}
const SERVICES = [
  { key: "github", name: "GitHub" },
  { key: "supabase", name: "Database (Supabase)" },
  { key: "vercel", name: "Website (Vercel)" },
] as const;

/** Which saved account this project uses for each service; projects keep their own choice. */
function AccountsCard({ id, options, active, onChange }: { id: string; options: AccountOption[]; active: Record<string, string | null>; onChange: () => void }) {
  const save = useServerFn(setTaskAccount);
  const [adding, setAdding] = useState<"Supabase" | "Vercel" | null>(null);
  const m = useMutation({
    mutationFn: (v: { provider: "github" | "supabase" | "vercel"; account: string }) => save({ data: { id, ...v } }),
    onSuccess: () => { toast.success("Account saved for this project"); onChange(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!options.length) return null;
  return (
    <section className="min-w-0 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Accounts for this project</h2>
      <p className="mt-1 text-xs text-muted-foreground">Each project remembers its own accounts, so tasks on different accounts can run at the same time.</p>
      <div className="mt-3 space-y-3">
        {SERVICES.map((svc) => {
          const list = options.filter((o) => o.provider === svc.key);
          if (!list.length) return null;
          return (
            <div key={svc.key} className="grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:items-center">
              <Label htmlFor={`account-${svc.key}`} className="text-sm">{svc.name}</Label>
              <Select value={active[svc.key] ?? ""} onValueChange={(v) => m.mutate({ provider: svc.key, account: v })} disabled={m.isPending || list.length < 2}>
                <SelectTrigger id={`account-${svc.key}`} className={trig}><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  {list.map((o) => <SelectItem key={o.id} value={o.id}>{o.label} ···{o.last4}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setAdding(adding === "Supabase" ? null : "Supabase")}>Add another database account</Button>
        <Button variant="outline" size="sm" onClick={() => setAdding(adding === "Vercel" ? null : "Vercel")}>Add another Vercel account</Button>
        <Button asChild variant="ghost" size="sm"><Link to="/settings">Add GitHub account in Settings</Link></Button>
      </div>
      {adding && <div className="mt-3 rounded-md border p-3"><NeedToken name={adding} onDone={async (accountId) => { await m.mutateAsync({ provider: adding === "Vercel" ? "vercel" : "supabase", account: accountId }); setAdding(null); }} /></div>}
    </section>
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

const GUIDES = {
  Supabase: {
    url: "https://supabase.com/dashboard/account/tokens",
    steps: ["Tap the button below to open Supabase (sign up free if needed).", "Tap “Generate new token”, give it any name, and copy it.", "Come back here, paste it, and tap Connect."],
  },
  Vercel: {
    url: "https://vercel.com/account/settings/tokens",
    steps: ["Tap the button below to open Vercel (sign up free with GitHub).", "Create a token: any name, scope “Full Account”, no expiry. Copy it.", "Come back here, paste it, and tap Connect."],
  },
} as const;

function NeedToken({ name, onDone }: { name: "Supabase" | "Vercel"; onDone: (accountId: string) => void | Promise<void> }) {
  const [key, setKey] = useState("");
  const save = useServerFn(saveCredential);
  const qc = useQueryClient();
  const g = GUIDES[name];
  const m = useMutation({
    mutationFn: () => save({ data: { provider: name === "Supabase" ? "supabase" : "vercel", label: name, key: key.trim(), base_url: null, custom_models: [], extra_body: null } }),
    onSuccess: async (r) => { toast.success(`${name} connected`); setKey(""); qc.invalidateQueries({ queryKey: ["creds"] }); await onDone(r.id); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3 text-sm">
      <ol className="space-y-2">
        {g.steps.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold">{i + 1}</span>
            <span className="min-w-0 pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
      <Button asChild variant="secondary" className="h-11 w-full"><a href={g.url} target="_blank" rel="noreferrer"><ExternalLink /> Get my {name} token</a></Button>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <Input className="h-11 min-w-0 flex-1 text-base sm:text-sm" type="password" autoComplete="off" placeholder="Paste token here" value={key} onChange={(e) => setKey(e.target.value)} />
        <Button className="h-11 shrink-0" disabled={!key.trim() || m.isPending}>{m.isPending ? "Checking…" : "Connect"}</Button>
      </form>
      <p className="text-xs text-muted-foreground">Your token is checked, encrypted and never shown again.</p>
    </div>
  );
}

function StepBadge({ done, n }: { done: boolean; n: number }) {
  return <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? "bg-primary text-primary-foreground" : "bg-accent"}`}>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>;
}

function SupabaseCard({ id, account, has, linked, onChange }: { id: string; account: string | null; has: boolean; linked: string | null; onChange: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [pick, setPick] = useState("");
  const [name, setName] = useState(`forge-${id.slice(0, 6)}`);
  const [org, setOrg] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const opts = useQuery({ queryKey: ["sb-opts", id, account], queryFn: useServerFn(listSupabaseOptions).bind(null, { data: { id, ...(account ? { account } : {}) } }), enabled: has && !linked });
  const orgId = org || opts.data?.orgs[0]?.id || "";
  const link = useServerFn(linkSupabase);
  const status = useQuery({ queryKey: ["migr", id, linked], queryFn: useServerFn(getMigrationStatus).bind(null, { data: { id } }), enabled: !!linked, refetchInterval: 15000 });
  const applyFn = useServerFn(applyMigrations);
  const linkM = useMutation({
    mutationFn: (v: Parameters<typeof link>[0]["data"]) => link({ data: v }),
    onSuccess: (r) => { onChange(); if (r.syncError) toast.error(r.syncError); else toast.success("Database updated"); },
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
      {!has ? <NeedToken name="Supabase" onDone={onChange} /> : linked ? (
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
              <details className="text-sm"><summary className="cursor-pointer py-1 text-muted-foreground">More options (team, location)</summary>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={orgId} onValueChange={setOrg}>
                  <SelectTrigger className={trig}><SelectValue placeholder="Organization" /></SelectTrigger>
                  <SelectContent>{opts.data?.orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger className={trig}><SelectValue /></SelectTrigger>
                  <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div></details>
              <Button className="h-11 w-full" disabled={!name.trim() || !orgId || linkM.isPending} onClick={() => linkM.mutate({ id, create: { name: name.trim(), orgId, region } })}>
                {linkM.isPending ? "Creating…" : "Create my database"}
              </Button>
              <p className="text-xs text-muted-foreground">New projects take about 2 minutes to start.</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function VercelCard({ id, options, account, has, linked, onChange, dbLinked }: { options: AccountOption[]; account: string | null; dbLinked?: boolean; id: string; has: boolean; linked: string | null; onChange: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [connection, setConnection] = useState<"existing" | "new">("existing");
  const [savedAccount, setSavedAccount] = useState("");
  const saveAccount = useServerFn(setTaskAccount);
  const connectM = useMutation({
    mutationFn: (value: string | null) => saveAccount({ data: { id, provider: "vercel", account: value } }),
    onSuccess: () => { onChange(); toast.success("Vercel connection updated for this task"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const [pick, setPick] = useState("");
  const projects = useQuery({ queryKey: ["vc-projects", id, account], queryFn: useServerFn(listVercelProjects).bind(null, { data: { id, ...(account ? { account } : {}) } }), enabled: has && !linked });
  const link = useServerFn(linkVercel);
  const deps = useQuery({ queryKey: ["deps", id, linked, account], queryFn: useServerFn(getDeployments).bind(null, { data: { id } }), enabled: !!linked, refetchInterval: 10000 });
  const linkM = useMutation({
    mutationFn: (v: Parameters<typeof link>[0]["data"]) => link({ data: v }),
    onSuccess: (r) => { onChange(); if (r.syncError) toast.error(r.syncError); else toast.success("Website updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sync = useServerFn(syncDeployEnv);
  const syncM = useMutation({
    mutationFn: (redeploy: boolean) => sync({ data: { id, redeploy } }),
    onSuccess: (r) => { toast.success(r.redeployed ? "Database keys sent to Vercel — rebuilding now" : "Database keys sent to Vercel"); deps.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const latest = deps.data?.deployments[0];
  const runtime = deps.data?.runtime;
  const failed = latest?.state === "ERROR" || runtime?.state === "ERROR";
  const color = failed ? "text-destructive" : runtime?.state === "PASSED" ? "text-primary" : "text-muted-foreground";
  const status = runtime?.state === "ERROR" ? "Built, but page is failing" : runtime?.state === "UNVERIFIED" ? "Built · page health unverified" : runtime?.state === "PASSED" ? "Built · entry page responding" : latest?.state.toLowerCase();

  return (
    <Card icon={<Rocket className="h-4 w-4 shrink-0" />} title="Vercel website">
      {has && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">Account connected · {options.find((o) => o.id === account)?.label ?? "Vercel"}</span><Button variant="outline" size="sm" disabled={connectM.isPending} onClick={() => connectM.mutate(null)}>{connectM.isPending ? "Unlinking…" : "Unlink Vercel account"}</Button></div>}
      {!has ? <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2"><Button variant={connection === "existing" ? "secondary" : "outline"} onClick={() => setConnection("existing")}>Use saved account</Button><Button variant={connection === "new" ? "secondary" : "outline"} onClick={() => setConnection("new")}>Connect new account</Button></div>
        {connection === "existing" ? <>
          <Select value={savedAccount} onValueChange={setSavedAccount}><SelectTrigger className={trig}><SelectValue placeholder="Choose saved Vercel account" /></SelectTrigger><SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label} ···{o.last4}</SelectItem>)}</SelectContent></Select>
          {!options.length && <p className="text-xs text-muted-foreground">No saved Vercel accounts. Connect a new account.</p>}
          <Button className="w-full" disabled={!savedAccount || connectM.isPending} onClick={() => connectM.mutate(savedAccount)}>Connect selected account</Button>
      </> : <NeedToken name="Vercel" onDone={async (accountId) => { await connectM.mutateAsync(accountId); }} />}
      </div> : linked ? (
        <div className="space-y-3 text-sm">
          <p className="break-all font-mono text-xs text-muted-foreground">Linked website · {linked}</p>
          <div className="flex items-center justify-between gap-2">
            <span className={`font-medium ${color}`}>{latest ? status : deps.isLoading ? "checking…" : "no deploy for this task yet"}</span>
            <Button size="sm" variant="outline" disabled={linkM.isPending} onClick={() => linkM.mutate({ id, unlink: true })}>{linkM.isPending ? "Unlinking…" : "Unlink website"}</Button>
          </div>
          {latest?.state === "READY" && (
            <Button asChild className="h-11 w-full"><a href={latest.url} target="_blank" rel="noreferrer"><ExternalLink /> Open preview</a></Button>
          )}
          {deps.data?.log && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 font-mono text-[11px]">{deps.data.log}</pre>}
          {runtime && runtime.state !== "PASSED" && <p className={`text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>{runtime.note}</p>}
          {dbLinked && (
            <div className="space-y-2">
              <Button variant="outline" className="h-11 w-full" disabled={syncM.isPending} onClick={() => syncM.mutate(false)}>Sync production settings & GitHub template</Button>
              <Button variant="outline" className="h-11 w-full" disabled={syncM.isPending} onClick={() => syncM.mutate(true)}>{syncM.isPending ? "Syncing…" : "Sync & rebuild work-branch preview"}</Button>
            </div>
          )}
          {failed && (
            <p className="text-xs text-muted-foreground">To have the agent fix it, go to Chat and send: <span className="font-medium text-foreground">"Fix the failed Vercel deploy"</span>.</p>
          )}
          <p className="text-xs text-muted-foreground">Forge requests a deployment after checks, not after every file save. Build success and entry-page health are checked separately.</p>
          {deps.error && <p className="text-xs text-destructive">{(deps.error as Error).message}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <ModeSwitch mode={mode} setMode={setMode} />
          {projects.error && <p className="text-xs text-destructive">{(projects.error as Error).message}</p>}
          {mode === "existing" ? (
            <>
              <Select value={pick} onValueChange={setPick} disabled={projects.isFetching || linkM.isPending}>
                <SelectTrigger className={trig}><SelectValue placeholder={projects.isLoading ? "Loading…" : "Choose a project"} /></SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">{projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.repo ? ` · ${p.repo}` : ""}</SelectItem>)}</SelectContent>
              </Select>
              <Button className="h-11 w-full" disabled={!pick || projects.isFetching || !projects.data?.some((p) => p.id === pick) || linkM.isPending} onClick={() => linkM.mutate({ id, projectId: pick })}>{linkM.isPending ? "Linking…" : "Link Vercel project"}</Button>
              {!projects.isFetching && !projects.error && projects.data?.length === 0 && <p className="text-xs text-muted-foreground">No projects in this Vercel account.</p>}
            </>
          ) : (
            <>
              <Button className="h-11 w-full" disabled={linkM.isPending} onClick={() => linkM.mutate({ id, create: true })}>
                {linkM.isPending ? "Creating…" : "Create & link website"}
              </Button>
              <p className="text-xs text-muted-foreground">If this fails with a GitHub error, Vercel needs permission to see your repo: <a className="text-primary underline" href="https://github.com/apps/vercel/installations/new" target="_blank" rel="noreferrer">allow Vercel on GitHub</a>, then try again.</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function DatabaseKeys({ id, saved, privileged, onChange }: { id: string; saved: boolean; privileged: boolean; onChange: () => void }) {
  const [url, setUrl] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const save = useServerFn(saveDatabaseSettings);
  const m = useMutation({
    mutationFn: () => save({ data: { id, url: url.trim(), publicKey: publicKey.trim(), serviceRoleKey: serviceRoleKey.trim() || undefined, removeServiceRole: false } }),
    onSuccess: (r) => { setUrl(""); setPublicKey(""); setServiceRoleKey(""); onChange(); toast.success(r.synced ? "Saved securely and synced to Vercel" : "Saved securely; connect Vercel next"); },
    onError: () => { setServiceRoleKey(""); toast.error("Settings could not finish saving or syncing. Check the linked project and retry."); },
  });
  return <details className="border-y py-3 text-sm">
    <summary className="cursor-pointer font-medium">Database URL & keys · {saved ? "saved securely" : "public settings fetched automatically"}</summary>
    <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="space-y-1"><Label htmlFor={`db-url-${id}`}>Public project URL</Label><Input id={`db-url-${id}`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} required autoComplete="off" /></div>
      <div className="space-y-1"><Label htmlFor={`db-key-${id}`}>Publishable or legacy anon key</Label><Input id={`db-key-${id}`} type="password" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} required autoComplete="off" /></div>
      <div className="space-y-1"><Label htmlFor={`db-service-${id}`}>Service role key (optional, server-only)</Label><Input id={`db-service-${id}`} type="password" value={serviceRoleKey} onChange={(e) => setServiceRoleKey(e.target.value)} autoComplete="off" placeholder={privileged ? "Already saved; leave blank to keep" : "Only if your app needs privileged server operations"} /></div>
      <p className="text-xs text-muted-foreground">Private keys stay encrypted and are sent only to Vercel’s server settings, never to GitHub or public website settings.</p>
      <Button type="submit" className="h-11 w-full" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save & sync settings"}</Button>
    </form>
  </details>;
}

function ModeSwitch({ mode, setMode }: { mode: "existing" | "new"; setMode: (m: "existing" | "new") => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["existing", "new"] as const).map((m) => (
        <Button key={m} type="button" variant="outline" onClick={() => setMode(m)} className={`h-11 text-sm ${mode === m ? "border-primary bg-accent" : "bg-background"}`}>
          {m === "existing" ? "I already have one" : "Create new"}
        </Button>
      ))}
    </div>
  );
}
