import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle, Trash2 } from "lucide-react";
import { deleteMemory, getRunEvents, getRunOverview, listMemories } from "@/lib/engine.functions";
import { stageProgress, type Stage } from "@/lib/engine/lifecycle";
import { Progress } from "@/components/ui/progress";

const FLOW: Stage[] = ["RECEIVED", "DISCOVERING", "PLANNING", "EXECUTING", "VERIFYING", "REPAIRING"];
const LABEL: Record<string, string> = {
  RECEIVED: "Received", DISCOVERING: "Reading project, skills & tools", PLANNING: "Planning", EXECUTING: "Working",
  VERIFYING: "Checking", REPAIRING: "Fixing", AWAITING_APPROVAL: "Waiting for your approval", AWAITING_INPUT: "Waiting for your answers", COMPLETED: "Completed",
  FAILED: "Failed", CANCELLED: "Stopped", BLOCKED: "Blocked",
};
type Ev = { seq: number; type: string; payload: Record<string, unknown>; created_at: string };

function describe(e: Ev): string | null {
  const p = e.payload;
  switch (e.type) {
    case "stage.changed": return `${LABEL[String(p["to"])] ?? p["to"]}${p["reason"] ? ` — ${p["reason"]}` : ""}`;
    case "context.loaded": return `Context: ${p["keptMessages"]} recent messages${Number(p["droppedForBudget"]) ? `, ${p["droppedForBudget"]} older trimmed to fit the model` : ""}, ${p["typedMemories"]} saved memories`;
    case "skills.discovery.completed": return `Skills: ${(p["loaded"] as unknown[] | undefined)?.length ?? 0} of ${p["total"]} loaded`;
    case "mcp.discovery.completed": return `External tools: ${((p["servers"] as { name: string; tools: number }[]) ?? []).map((s) => `${s.name} (${s.tools})`).join(", ") || "none connected"}${((p["issues"] as unknown[]) ?? []).length ? " — some issues" : ""} · ${p["ms"]} ms`;
    case "tool.execution.completed": return p["ok"] ? null : `${p["tool"]} failed (${String(p["category"] ?? "error").replace("_", " ")})${p["summary"] ? `: ${p["summary"]}` : ""}`;
    case "agents.dispatched": return `Dispatched ${(p["jobs"] as unknown[]).length} specialist agent(s) in ${p["waves"]} wave(s)`;
    case "agent.completed": return `${p["role"]} "${p["label"]}" ${p["ok"] ? "finished" : "failed"} in ${Math.round(Number(p["ms"] ?? 0) / 1000)}s`;
    case "model.fallback": return `Switched to backup model ${p["to"]} (${p["category"]})`;
    case "repair.started": return `Repair round ${p["round"]}: ${p["blocker"]}`;
    case "memory.saved": return `Saved a ${p["category"]} memory`;
    case "run.completed": return `Run ended after ${Math.round(Number(p["totalMs"] ?? 0) / 1000)}s`;
    default: return null;
  }
}

export function RunTimeline({ sessionId, repo, running }: { sessionId: string; repo: string; running: boolean }) {
  const overviewFn = useServerFn(getRunOverview);
  const eventsFn = useServerFn(getRunEvents);
  const memFn = useServerFn(listMemories);
  const delMem = useServerFn(deleteMemory);
  const qc = useQueryClient();
  const [runId, setRunId] = useState<string | undefined>();
  const overview = useQuery({ queryKey: ["run", sessionId, runId], queryFn: () => overviewFn({ data: { sessionId, runId } }), refetchInterval: running ? 3000 : false });
  const memories = useQuery({ queryKey: ["memories", repo], queryFn: () => memFn({ data: { repo } }) });
  const [events, setEvents] = useState<Ev[]>([]);
  const cursor = useRef<{ run: string | null; seq: number }>({ run: null, seq: 0 });
  const run = overview.data?.run;

  // Incremental replay: only fetch events after the last seen sequence number.
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

  if (overview.isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading run…</div>;
  if (!run) return <div className="p-4 text-sm text-muted-foreground">No recorded runs yet. Send a message to start one.</div>;

  const reached = [...new Set(["RECEIVED", ...overview.data!.transitions.map((t) => t.to_stage)])] as Stage[];
  const current = run.stage as Stage;
  const terminal = ["COMPLETED", "FAILED", "CANCELLED", "BLOCKED", "AWAITING_APPROVAL", "AWAITING_INPUT"].includes(current);
  const pct = stageProgress(reached);
  const m = (run.metrics ?? {}) as Record<string, unknown> & { tools?: Record<string, { n: number; ms: number; failed: number }>; usage?: { input: number; output: number } };
  const lines = events.map((e) => ({ e, text: describe(e) })).filter((x) => x.text);

  return (
    <div className="space-y-4 p-3 text-sm">
      {overview.data!.runs.length > 1 && (
        <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={run.id} onChange={(e) => setRunId(e.target.value)} aria-label="Choose run">
          {overview.data!.runs.map((r) => <option key={r.id} value={r.id}>{new Date(r.started_at).toLocaleString()} · {LABEL[r.stage] ?? r.stage} · {r.objective}</option>)}
        </select>
      )}
      <section className="space-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2">
          {current === "COMPLETED" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : current === "FAILED" || current === "CANCELLED" ? <XCircle className="h-4 w-4 text-destructive" /> : current === "BLOCKED" || current === "AWAITING_APPROVAL" || current === "AWAITING_INPUT" ? <AlertTriangle className="h-4 w-4 text-muted-foreground" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="font-medium">{LABEL[current] ?? current}</span>
          <span className="ml-auto text-xs text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} aria-label="Run progress from stages reached" />
        <ol className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
          {FLOW.filter((s) => s !== "REPAIRING" || reached.includes("REPAIRING")).filter((s) => s !== "PLANNING" || reached.includes("PLANNING")).map((s) => {
            const done = reached.includes(s) && (s !== current || terminal);
            const active = s === current && !terminal;
            return <li key={s} className={`flex items-center gap-1 ${done || active ? "" : "text-muted-foreground"}`}>
              {done ? <CheckCircle2 className="h-3 w-3 text-primary" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : <Circle className="h-3 w-3" />}{LABEL[s]}
            </li>;
          })}
        </ol>
        {terminal && overview.data!.transitions.at(-1)?.reason && <p className="text-xs text-muted-foreground">{overview.data!.transitions.at(-1)!.reason}</p>}
        <p className="break-all text-[11px] text-muted-foreground">Model {run.model} · level {run.autonomy} · trace {run.trace_id.slice(0, 12)}</p>
      </section>

      {terminal && (
        <section className="rounded-md border p-3">
          <h3 className="mb-2 font-medium">Measurements</h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Total time</dt><dd>{m["totalMs"] ? `${Math.round(Number(m["totalMs"]) / 1000)}s` : "—"}</dd>
            <dt className="text-muted-foreground">First response</dt><dd>{m["timeToFirstTokenMs"] != null ? `${(Number(m["timeToFirstTokenMs"]) / 1000).toFixed(1)}s` : "—"}</dd>
            <dt className="text-muted-foreground">Setup (project/skills/tools)</dt><dd>{m["discoveryMs"] != null ? `${(Number(m["discoveryMs"]) / 1000).toFixed(1)}s` : "—"}</dd>
            <dt className="text-muted-foreground">Steps</dt><dd>{String(m["steps"] ?? "—")}</dd>
            <dt className="text-muted-foreground">Tokens in / out</dt><dd>{m.usage ? `${m.usage.input.toLocaleString()} / ${m.usage.output.toLocaleString()}` : "—"}</dd>
            <dt className="text-muted-foreground">Estimated cost</dt><dd>{m["costUsd"] != null ? `$${Number(m["costUsd"]).toFixed(4)}` : "price unknown for this model"}</dd>
          </dl>
          {m.tools && Object.keys(m.tools).length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs">
              {Object.entries(m.tools).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8).map(([name, t]) => (
                <li key={name} className="flex gap-2"><span className="flex-1 truncate font-mono">{name}</span><span>{t.n}×</span><span>{(t.ms / 1000).toFixed(1)}s</span>{t.failed > 0 && <span className="text-destructive">{t.failed} failed</span>}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-md border p-3">
        <h3 className="mb-2 font-medium">Skills</h3>
        {overview.data!.skills.length === 0 ? <p className="text-xs text-muted-foreground">No skills recorded.</p> : (
          <ul className="space-y-1 text-xs">
            {overview.data!.skills.filter((s) => s.status !== "listed").map((s, i) => (
              <li key={i}><span className={`mr-1 rounded px-1 ${s.status === "missing" ? "bg-destructive/15 text-destructive" : "bg-accent"}`}>{s.status}</span><span className="font-medium">{s.skill_name}</span> — {s.reason}</li>
            ))}
            {overview.data!.skills.some((s) => s.status === "listed") && <li className="text-muted-foreground">{overview.data!.skills.filter((s) => s.status === "listed").length} other skill(s) available but not needed.</li>}
          </ul>
        )}
      </section>

      {overview.data!.mcp.length > 0 && (
        <section className="rounded-md border p-3">
          <h3 className="mb-2 font-medium">External tool calls</h3>
          <ul className="space-y-0.5 text-xs">
            {overview.data!.mcp.map((x, i) => <li key={i} className="flex gap-2"><span className="flex-1 truncate">{x.server_name} · {x.tool_name}</span><span>{x.decision}{x.ok === false ? " (failed)" : ""}</span>{x.duration_ms != null && <span>{x.duration_ms} ms</span>}</li>)}
          </ul>
        </section>
      )}

      {overview.data!.errors.length > 0 && (
        <section className="rounded-md border p-3">
          <h3 className="mb-2 font-medium">Errors ({overview.data!.errors.length})</h3>
          <ul className="space-y-1 text-xs">
            {overview.data!.errors.map((e, i) => <li key={i}><span className="mr-1 rounded bg-destructive/15 px-1 text-destructive">{e.category.replace("_", " ")}</span><span className="text-muted-foreground">{e.service}</span> — <span className="break-words">{e.message}</span></li>)}
          </ul>
        </section>
      )}

      <section className="rounded-md border p-3">
        <h3 className="mb-2 font-medium">Timeline</h3>
        {lines.length === 0 ? <p className="text-xs text-muted-foreground">No milestones yet.</p> : (
          <ol className="max-h-80 space-y-1 overflow-y-auto text-xs">
            {lines.map(({ e, text }) => <li key={e.seq} className="flex gap-2"><span className="shrink-0 tabular-nums text-muted-foreground">{new Date(e.created_at).toLocaleTimeString()}</span><span className="break-words">{text}</span></li>)}
          </ol>
        )}
      </section>

      <section className="rounded-md border p-3">
        <h3 className="mb-2 font-medium">Saved memories for this repository</h3>
        {!memories.data?.length ? <p className="text-xs text-muted-foreground">None yet. The agent saves project facts, your preferences, decisions and past errors here.</p> : (
          <ul className="space-y-1 text-xs">
            {memories.data.map((mm) => (
              <li key={mm.id} className="flex items-start gap-2">
                <span className="shrink-0 rounded bg-accent px-1">{mm.category}</span>
                <span className="flex-1 break-words">{mm.content}</span>
                <button type="button" aria-label="Delete memory" className="shrink-0 p-1 text-muted-foreground hover:text-destructive" onClick={async () => { await delMem({ data: { id: mm.id } }); qc.invalidateQueries({ queryKey: ["memories", repo] }); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
