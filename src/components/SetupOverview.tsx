import { CheckCircle2, CircleDashed, Cpu, Database, GitBranch, Globe } from "lucide-react";
import type { Credential } from "@/lib/providers";

type Tab = "profile" | "ai" | "accounts" | "tools";

/** Readiness strip: what Forge needs to build and publish, and where to fix each gap. */
export function SetupOverview({ creds, onPick }: { creds: Credential[] | undefined; onPick: (t: Tab) => void }) {
  const has = (p: string) => !!creds?.some((c) => c.provider === p);
  const ai = creds?.filter((c) => !["github", "supabase", "vercel"].includes(c.provider)).length ?? 0;
  const items = [
    { label: "AI provider", ok: ai > 0, detail: ai ? `${ai} key${ai > 1 ? "s" : ""}` : "Required", icon: Cpu, tab: "ai" as Tab, required: true },
    { label: "GitHub", ok: has("github"), detail: has("github") ? "Connected" : "Required", icon: GitBranch, tab: "accounts" as Tab, required: true },
    { label: "Database", ok: has("supabase"), detail: has("supabase") ? "Connected" : "Optional", icon: Database, tab: "accounts" as Tab, required: false },
    { label: "Vercel", ok: has("vercel"), detail: has("vercel") ? "Connected" : "Optional", icon: Globe, tab: "accounts" as Tab, required: false },
  ];
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  const ready = items.filter((i) => i.required).every((i) => i.ok);

  return (
    <section className="panel overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Setup</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ready ? "You're ready to build" : "Finish setting up Forge"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{ready ? "Connect a database and Vercel anytime to publish live sites." : "Add an AI key and GitHub to start your first project."}</p>
        </div>
        <div className="text-right"><span className="text-3xl font-semibold tabular-nums">{pct}%</span><p className="text-xs text-muted-foreground">{done} of {items.length} connected</p></div>
      </div>
      <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
        {items.map((i) => (
          <button key={i.label} type="button" onClick={() => onPick(i.tab)} className="group flex min-w-0 items-center gap-3 p-4 text-left transition-colors hover:bg-accent/40">
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${i.ok ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><i.icon className="size-4" /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{i.label}</span>
              <span className={`flex items-center gap-1 text-xs ${i.ok ? "text-muted-foreground" : i.required ? "text-destructive" : "text-muted-foreground"}`}>
                {i.ok ? <CheckCircle2 className="size-3 text-success" /> : <CircleDashed className="size-3" />}{i.detail}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
