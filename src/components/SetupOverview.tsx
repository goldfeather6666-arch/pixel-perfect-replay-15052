import { CheckCircle2, ChevronRight, Cpu, Database, GitBranch, Globe } from "lucide-react";
import type { Credential } from "@/lib/providers";

type Tab = "profile" | "ai" | "accounts" | "tools";

/** Compact readiness card: progress ring plus one-tap status chips for each connection. */
export function SetupOverview({ creds, onPick }: { creds: Credential[] | undefined; onPick: (t: Tab) => void }) {
  const has = (p: string) => !!creds?.some((c) => c.provider === p);
  const ai = creds?.filter((c) => !["github", "supabase", "vercel"].includes(c.provider)).length ?? 0;
  const items = [
    { label: "AI", ok: ai > 0, required: true, icon: Cpu, tab: "ai" as Tab },
    { label: "GitHub", ok: has("github"), required: true, icon: GitBranch, tab: "accounts" as Tab },
    { label: "Database", ok: has("supabase"), required: false, icon: Database, tab: "accounts" as Tab },
    { label: "Vercel", ok: has("vercel"), required: false, icon: Globe, tab: "accounts" as Tab },
  ];
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  const ready = items.filter((i) => i.required).every((i) => i.ok);
  const firstGap = items.find((i) => !i.ok);
  const r = 18, c = 2 * Math.PI * r;

  return (
    <section className="panel rounded-2xl p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <div className="relative size-12 shrink-0">
          <svg viewBox="0 0 44 44" className="size-12 -rotate-90">
            <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
            <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary transition-all" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold tabular-nums">{pct}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">{ready ? (done === 4 ? "All connected" : "Ready to build") : "Finish setup"}</h1>
          <p className="truncate text-xs text-muted-foreground">{done} of 4 connected{firstGap ? ` · next: ${firstGap.label}` : ""}</p>
        </div>
        {firstGap && (
          <button type="button" onClick={() => onPick(firstGap.tab)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground">
            Connect <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {items.map((i) => (
          <button key={i.label} type="button" onClick={() => onPick(i.tab)} title={i.ok ? "Connected" : i.required ? "Required" : "Optional"}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition-colors hover:bg-accent/50 ${i.ok ? "border-primary/30 bg-primary/5 text-foreground" : i.required ? "border-dashed border-destructive/40 text-destructive" : "border-dashed text-muted-foreground"}`}>
            <span className="relative"><i.icon className="size-4" />{i.ok && <CheckCircle2 className="absolute -right-2 -top-1.5 size-3 text-success" />}</span>
            <span className="max-w-full truncate">{i.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
