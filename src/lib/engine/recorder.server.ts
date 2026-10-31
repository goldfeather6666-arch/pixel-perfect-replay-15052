import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, type Stage } from "./lifecycle";
import { classifyError, redact } from "./errors";

type Json = Record<string, unknown>;

/**
 * Durable run recorder. Writes are queued in order and never block or fail the agent: a
 * recording problem is reported once in the run, not allowed to break user work.
 */
export async function startRecorder(sb: SupabaseClient, input: { sessionId: string; objective: string; provider: string; model: string; autonomy: string }) {
  const started = Date.now();
  const { data, error } = await sb.rpc("engine_start_run", { _session: input.sessionId, _objective: input.objective, _provider: input.provider, _model: input.model, _autonomy: input.autonomy });
  const run = (Array.isArray(data) ? data[0] : data) as { id: string; trace_id: string } | null;
  let stage: Stage = "RECEIVED";
  const reached: Stage[] = ["RECEIVED"];
  let chain: Promise<unknown> = Promise.resolve();
  let failures = 0;
  const timers: Record<string, number> = {};
  const metrics: Json & { tools: Record<string, { n: number; ms: number; failed: number }> } = { tools: {} };
  const queue = (fn: () => PromiseLike<{ error: unknown } | unknown>) => {
    if (!run) return;
    chain = chain.then(fn).then((r) => { if (r && typeof r === "object" && "error" in r && (r as { error: unknown }).error) failures++; }, () => { failures++; });
  };
  const event = (type: string, payload: Json = {}) => queue(() => sb.rpc("engine_event", { _run: run!.id, _type: type, _payload: payload }));
  return {
    runId: run?.id ?? null,
    traceId: run?.trace_id ?? "",
    available: !!run && !error,
    get stage() { return stage; },
    reached,
    event,
    to(next: Stage, reason = "") {
      if (stage === next || !canTransition(stage, next)) return false;
      stage = next;
      reached.push(next);
      queue(() => sb.rpc("engine_transition", { _run: run!.id, _to: next, _reason: redact(reason, 300) }));
      return true;
    },
    error(service: string, raw: string) {
      const message = redact(raw);
      const { category, retryable } = classifyError(message);
      queue(() => sb.rpc("engine_record", { _run: run!.id, _kind: "error", _row: { service, category, message, retryable } }));
      return { category, retryable, message };
    },
    skill(row: { name: string; hash: string; status: "loaded" | "listed" | "read" | "missing"; reason: string }) {
      queue(() => sb.rpc("engine_record", { _run: run!.id, _kind: "skill", _row: row }));
    },
    mcp(row: { server: string; tool: string; decision: "executed" | "staged" | "denied" | "invalid"; ok?: boolean; ms?: number }) {
      queue(() => sb.rpc("engine_record", { _run: run!.id, _kind: "mcp", _row: row }));
    },
    mark(name: string) { timers[name] = Date.now(); },
    since(name: string) { return timers[name] ? Date.now() - timers[name]! : 0; },
    metric(key: string, value: unknown) { if (!(key in metrics)) metrics[key] = value; },
    set(key: string, value: unknown) { metrics[key] = value; },
    tool(name: string, ms: number, ok: boolean) {
      const t = (metrics.tools[name] ??= { n: 0, ms: 0, failed: 0 });
      t.n++; t.ms += ms; if (!ok) t.failed++;
    },
    async finish(extra: Json) {
      metrics["totalMs"] = Date.now() - started;
      metrics["recordingFailures"] = failures;
      Object.assign(metrics, extra);
      queue(() => sb.rpc("engine_record", { _run: run!.id, _kind: "metrics", _row: metrics }));
      event("run.completed", { stage, totalMs: metrics["totalMs"] });
      await chain.catch(() => {});
    },
  };
}
export type Recorder = Awaited<ReturnType<typeof startRecorder>>;
