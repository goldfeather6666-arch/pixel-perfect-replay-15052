import { Bot, Cpu, Gauge, Lock, Network, Wrench } from "lucide-react";
import type { ChatMessage, ToolLog } from "@/lib/providers";
import { costUsd, modelCaps } from "@/lib/engine/model-registry";

type Job = { label: string; role: string; paths?: string[]; after?: string[] };

const ROLE_TONE: Record<string, string> = {
  coder: "text-primary", frontend: "text-primary", backend: "text-primary", database: "text-primary", integration: "text-primary",
  tester: "text-warning", qa: "text-warning", debugger: "text-warning",
};

/** Group jobs into dependency waves (jobs whose `after` deps are all in earlier waves). */
export function toWaves(jobs: Job[]): Job[][] {
  const done = new Set<string>();
  const left = [...jobs];
  const waves: Job[][] = [];
  while (left.length) {
    const wave = left.filter((j) => (j.after ?? []).every((d) => done.has(d)));
    if (!wave.length) { waves.push(left.splice(0)); break; }
    for (const j of wave) { done.add(j.label); left.splice(left.indexOf(j), 1); }
    waves.push(wave);
  }
  return waves;
}

export function SwarmMatrix({ messages, usage, model, running }: { messages: ChatMessage[]; usage: { input: number; output: number }; model: string; running: boolean }) {
  const tools: ToolLog[] = messages.flatMap((m) => m.tools ?? []).filter((t) => t.name !== "note");
  const dispatches = tools.filter((t) => t.name === "delegate");
  const latest = dispatches.at(-1);
  const jobs = ((latest?.input as { jobs?: Job[] } | undefined)?.jobs ?? []).filter((j) => j && j.label);
  const waves = toWaves(jobs);
  const caps = modelCaps(model);
  const cost = costUsd(caps, usage);
  const counts = new Map<string, { n: number; fail: number }>();
  for (const t of tools) {
    const c = counts.get(t.name) ?? { n: 0, fail: 0 };
    c.n++; if (t.ok === false) c.fail++;
    counts.set(t.name, c);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  const max = ranked[0]?.[1].n ?? 1;
  const failed = tools.filter((t) => t.ok === false).length;
  const pct = Math.min(100, Math.round(((usage.input + usage.output) / Math.max(1, caps.contextWindow * 10)) * 100));

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={Wrench} label="Tool calls" value={String(tools.length)} hint={failed ? `${failed} failed` : "no failures"} />
        <Stat icon={Network} label="Dispatches" value={String(dispatches.length)} hint={jobs.length ? `${jobs.length} jobs last wave set` : "solo master"} />
        <Stat icon={Cpu} label="Tokens in / out" value={`${short(usage.input)} / ${short(usage.output)}`} hint={cost != null ? `≈ $${cost.toFixed(3)}` : "price unknown"} />
        <Stat icon={Gauge} label="Context window" value={short(caps.contextWindow)} hint={caps.known ? model : `${model} · unverified`} />
      </div>

      <section className="panel p-3">
        <h3 className="hud-label mb-2 flex items-center gap-1.5"><Gauge className="h-3 w-3" /> Token burn</h3>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Total task tokens relative to 10 full context windows. Input {short(usage.input)}, output {short(usage.output)}.</p>
      </section>

      <section className="panel p-3">
        <h3 className="hud-label mb-3 flex items-center gap-1.5"><Network className="h-3 w-3" /> Swarm graph {running && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}</h3>
        <div className="flex flex-col items-center">
          <Node label="Master" role="dispatcher" status={latest ? (latest.ok === undefined ? "live" : latest.ok ? "ok" : "fail") : running ? "live" : "idle"} />
          {waves.map((wave, i) => (
            <div key={i} className="flex w-full flex-col items-center">
              <div className="h-4 w-px bg-border" />
              <p className="hud-label mb-1">Wave {i + 1}</p>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {wave.map((j) => (
                  <div key={j.label} className="rounded-lg border bg-background/60 p-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Bot className={`h-3.5 w-3.5 ${ROLE_TONE[j.role] ?? "text-muted-foreground"}`} />
                      <span className="truncate font-medium">{j.label}</span>
                      <span className="ml-auto rounded bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{j.role}</span>
                    </div>
                    {!!j.paths?.length && (
                      <ul className="mt-1.5 space-y-0.5">
                        {j.paths.slice(0, 4).map((p) => <li key={p} className="flex items-center gap-1 truncate font-mono text-[10px] text-muted-foreground"><Lock className="h-2.5 w-2.5 shrink-0 text-primary" />{p}</li>)}
                        {j.paths.length > 4 && <li className="font-mono text-[10px] text-muted-foreground">+{j.paths.length - 4} more</li>}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!jobs.length && <p className="mt-3 text-center text-xs text-muted-foreground">No specialists dispatched yet. The master works solo until a task is large enough to split.</p>}
        </div>
        {latest?.summary && <p className="mt-3 line-clamp-3 border-t pt-2 font-mono text-[11px] text-muted-foreground">{latest.summary}</p>}
      </section>

      <section className="panel p-3">
        <h3 className="hud-label mb-2 flex items-center gap-1.5"><Wrench className="h-3 w-3" /> Tool matrix</h3>
        {!ranked.length && <p className="text-xs text-muted-foreground">No tools used yet.</p>}
        <ul className="space-y-1.5">
          {ranked.slice(0, 14).map(([name, c]) => (
            <li key={name} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate font-mono">{name}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${(c.n / max) * 100}%` }} /></span>
              <span className="tabular-nums text-muted-foreground">{c.n}{c.fail ? <span className="text-destructive"> · {c.fail}✗</span> : null}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Node({ label, role, status }: { label: string; role: string; status: "idle" | "live" | "ok" | "fail" }) {
  const dot = status === "live" ? "animate-pulse bg-primary" : status === "ok" ? "bg-primary" : status === "fail" ? "bg-destructive" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-accent px-3 py-1.5 text-xs shadow-glow">
      <span className={`h-2 w-2 rounded-full ${dot}`} /><span className="font-semibold">{label}</span><span className="font-mono text-[10px] text-muted-foreground">{role}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Bot; label: string; value: string; hint: string }) {
  return (
    <div className="panel p-2.5">
      <p className="hud-label flex items-center gap-1"><Icon className="h-3 w-3" />{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p>
      <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function short(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
