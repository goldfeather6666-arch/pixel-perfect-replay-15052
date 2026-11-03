import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Brain, CheckCircle2, Eye, FilePen, FileSearch, GitBranch, Hammer, Loader2, Rocket, Search,
  Sparkles, Terminal, Users, Wrench, XCircle, AlertTriangle, ShieldCheck, Clock,
} from "lucide-react";
import { getRunEvents, getRunOverview } from "@/lib/engine.functions";

type Ev = { seq: number; type: string; payload: Record<string, unknown>; created_at: string };
type Item = { key: string; icon: typeof Brain; title: string; detail?: string | undefined; targets?: string[]; ms?: number; tone: "ok" | "bad" | "warn" | "info"; at: string; group: string };

const STAGE: Record<string, string> = {
  RECEIVED: "Got your request", DISCOVERING: "Reading the project", PLANNING: "Planning the work", EXECUTING: "Building",
  VERIFYING: "Checking the result", REPAIRING: "Fixing issues", AWAITING_APPROVAL: "Waiting for your approval",
  AWAITING_INPUT: "Waiting for your answer", COMPLETED: "Done", FAILED: "Failed", CANCELLED: "Stopped", BLOCKED: "Blocked",
};

function toolInfo(tool: string): { icon: typeof Brain; verb: string } {
  if (/write|edit|patch|create|delete|rename/.test(tool)) return { icon: FilePen, verb: "Edited files" };
  if (/read|view|list|tree|symbol/.test(tool)) return { icon: FileSearch, verb: "Read code" };
  if (/search|grep|find/.test(tool)) return { icon: Search, verb: "Searched" };
  if (/command|shell|run|exec|terminal/.test(tool)) return { icon: Terminal, verb: "Ran a command" };
  if (/deploy|vercel|publish/.test(tool)) return { icon: Rocket, verb: "Deployment" };
  if (/preview|browser|screenshot/.test(tool)) return { icon: Eye, verb: "Checked preview" };
  if (/git|branch|commit|pr/.test(tool)) return { icon: GitBranch, verb: "Git" };
  return { icon: Wrench, verb: "Used a tool" };
}

const pretty = (t: string) => t.replace(/_/g, " ");

export function toItem(e: Ev): Item | null {
  const p = e.payload;
  const base = { key: String(e.seq), at: e.created_at };
  switch (e.type) {
    case "stage.changed": {
      const to = String(p["to"]);
      const tone = to === "COMPLETED" ? "ok" : to === "FAILED" || to === "CANCELLED" ? "bad" : to.startsWith("AWAITING") || to === "BLOCKED" ? "warn" : "info";
      return { ...base, icon: to === "COMPLETED" ? CheckCircle2 : to === "PLANNING" ? Brain : to === "VERIFYING" ? ShieldCheck : to === "REPAIRING" ? Hammer : Sparkles, title: STAGE[to] ?? to, detail: p["reason"] ? String(p["reason"]) : undefined, tone, group: "stage" };
    }
    case "tool.execution.completed": {
      const tool = String(p["tool"] ?? "tool");
      const t = toolInfo(tool);
      const target = p["target"] ? String(p["target"]) : undefined;
      return { ...base, icon: p["ok"] ? t.icon : XCircle, title: p["ok"] ? t.verb : `${pretty(tool)} failed`, detail: p["summary"] ? String(p["summary"]) : pretty(tool), targets: target ? [target] : [], ms: Number(p["ms"] ?? 0), tone: p["ok"] ? "info" : "bad", group: p["ok"] ? `tool:${t.verb}` : base.key };
    }
    case "skills.discovery.completed": return { ...base, icon: Sparkles, title: "Loaded skills", detail: `${(p["loaded"] as unknown[] | undefined)?.length ?? 0} of ${p["total"]}`, tone: "info", group: base.key };
    case "agents.dispatched": return { ...base, icon: Users, title: `Started ${(p["jobs"] as unknown[]).length} helper agents`, detail: `${p["waves"]} wave(s)`, tone: "info", group: base.key };
    case "agent.completed": return { ...base, icon: p["ok"] ? CheckCircle2 : XCircle, title: `${p["role"]} ${p["ok"] ? "finished" : "failed"}`, detail: String(p["label"] ?? ""), tone: p["ok"] ? "ok" : "bad", group: base.key };
    case "repair.started": return { ...base, icon: Hammer, title: `Fix attempt ${p["round"]}`, detail: String(p["blocker"] ?? ""), tone: "warn", group: base.key };
    case "qa.gate": return { ...base, icon: ShieldCheck, title: p["passed"] ? "Checks passed" : "Checks failed", tone: p["passed"] ? "ok" : "bad", group: base.key };
    case "model.fallback": return { ...base, icon: AlertTriangle, title: `Switched to ${p["to"]}`, tone: "warn", group: base.key };
    case "memory.saved": return { ...base, icon: Brain, title: "Remembered something", detail: String(p["category"] ?? ""), tone: "info", group: base.key };
    case "run.completed": return { ...base, icon: Clock, title: `Finished in ${Math.round(Number(p["totalMs"] ?? 0) / 1000)}s`, tone: "ok", group: base.key };
    default: return null;
  }
}

/** Collapse consecutive identical successful tool steps into one row with a count. */
export function groupItems(items: Item[]): (Item & { count: number })[] {
  const out: (Item & { count: number })[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && it.group.startsWith("tool:") && last.group === it.group) { last.count++; last.detail = it.detail; last.at = it.at; last.targets = [...(last.targets ?? []), ...(it.targets ?? [])]; last.ms = (last.ms ?? 0) + (it.ms ?? 0); continue; }
    out.push({ ...it, count: 1 });
  }
  return out;
}

const TONE = { ok: "bg-primary/15 text-primary", bad: "bg-destructive/15 text-destructive", warn: "bg-accent text-accent-foreground", info: "bg-muted text-foreground" };

export function StreamTimeline({ sessionId, running }: { sessionId: string; running: boolean }) {
  const overviewFn = useServerFn(getRunOverview);
  const eventsFn = useServerFn(getRunEvents);
  const [runId, setRunId] = useState<string | undefined>();
  const overview = useQuery({ queryKey: ["stream-run", sessionId, runId], queryFn: () => overviewFn({ data: { sessionId, runId } }), refetchInterval: running ? 1500 : false });
  const [events, setEvents] = useState<Ev[]>([]);
  const cursor = useRef<{ run: string | null; seq: number }>({ run: null, seq: 0 });
  const bottom = useRef<HTMLDivElement>(null);
  const run = overview.data?.run;

  useEffect(() => {
    if (!run) return;
    if (cursor.current.run !== run.id) { cursor.current = { run: run.id, seq: 0 }; setEvents([]); }
    if (run.next_seq <= cursor.current.seq) return;
    let cancelled = false;
    (async () => {
      let more = true;
      while (more && !cancelled) {
        const r = await eventsFn({ data: { runId: run.id, afterSeq: cursor.current.seq } });
        if (cancelled || cursor.current.run !== run.id) return;
        const fresh = (r.events as Ev[]).filter((e) => e.seq > cursor.current.seq);
        if (fresh.length) { cursor.current.seq = fresh[fresh.length - 1]!.seq; setEvents((prev) => [...prev, ...fresh]); }
        more = r.hasMore;
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [run?.id, run?.next_seq, eventsFn]);

  const items = groupItems(events.map(toItem).filter((x): x is Item => !!x));
  const live = running && run && !["COMPLETED", "FAILED", "CANCELLED", "BLOCKED"].includes(run.stage);
  useEffect(() => { if (live) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [items.length, live]);

  if (overview.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading timeline…</div>;
  if (!run) return <div className="p-6 text-sm text-muted-foreground">Nothing yet. Send a message and every step will appear here live.</div>;

  return (
    <div className="mx-auto max-w-2xl p-4 text-sm">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`relative flex h-2.5 w-2.5 ${live ? "" : "opacity-40"}`}>
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <h2 className="font-semibold">{live ? "Working live" : STAGE[run.stage] ?? run.stage}</h2>
        <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">· {run.objective}</span>
        {overview.data!.runs.length > 1 && (
          <select className="h-8 w-full rounded-full border sm:ml-auto sm:w-auto sm:max-w-[45%] bg-background px-2 text-xs" value={run.id} onChange={(e) => setRunId(e.target.value)} aria-label="Choose run">
            {overview.data!.runs.map((r) => <option key={r.id} value={r.id}>{new Date(r.started_at).toLocaleString()} · {STAGE[r.stage] ?? r.stage}</option>)}
          </select>
        )}
      </header>

      <ol className="relative space-y-1 border-l border-border pl-5">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.key} className="relative animate-in fade-in slide-in-from-bottom-1 duration-300">
              <span className={`absolute -left-[31px] top-1.5 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-background ${TONE[it.tone]}`}><Icon className="h-3 w-3" /></span>
              <div className="rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{it.title}</span>
                  {it.count > 1 && <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">×{it.count}</span>}
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{new Date(it.at).toLocaleTimeString()}</span>
                </div>
                {it.detail && !it.targets?.length && <p className="break-words text-xs text-muted-foreground">{it.detail}</p>}
                {!!it.targets?.length && <Targets targets={it.targets} ms={it.ms} />}
              </div>
            </li>
          );
        })}
        {live && (
          <li className="relative">
            <span className="absolute -left-[31px] top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary ring-4 ring-background"><Loader2 className="h-3 w-3 animate-spin" /></span>
            <div className="px-2 py-1.5 text-muted-foreground">Thinking…</div>
          </li>
        )}
      </ol>
      <div ref={bottom} />
    </div>
  );
}

/** Lovable-style brief detail: first few files/commands as chips, rest behind "+N more". */
function Targets({ targets, ms }: { targets: string[]; ms?: number | undefined }) {
  const [open, setOpen] = useState(false);
  const uniq = [...new Set(targets)];
  const shown = open ? uniq : uniq.slice(0, 3);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {shown.map((t) => <code key={t} className="max-w-full truncate rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{t}</code>)}
      {uniq.length > 3 && <button type="button" onClick={() => setOpen(!open)} className="text-[11px] text-primary hover:underline">{open ? "Show less" : `+${uniq.length - 3} more`}</button>}
      {!!ms && ms > 1000 && <span className="text-[11px] text-muted-foreground">· {(ms / 1000).toFixed(1)}s</span>}
    </div>
  );
}
