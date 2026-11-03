// Tool broker (handbook §8): risk classes, side-effect state, idempotency and retry policy.
// Sits between model-generated calls and real execution. Existing autonomy/approval checks
// inside each tool remain authoritative; the broker adds dedupe and honest ambiguity handling.

export type Risk = "read" | "reversible_write" | "external_effect" | "destructive";
export type SideEffectState = "none" | "confirmed" | "possible" | "unknown";
export type ToolPolicy = { risk: Risk; idempotent: boolean };

const R = (risk: Risk, idempotent = risk === "read"): ToolPolicy => ({ risk, idempotent });

/** Known Forge tools. Unknown tools (skills, MCP) default to external_effect, non-idempotent. */
export const TOOL_POLICY: Record<string, ToolPolicy> = {
  list_files: R("read"), read_files: R("read"), read_file: R("read"), search_files: R("read"),
  recall_memory: R("read"), preview_status: R("read"), preview_logs: R("read"), preview_errors: R("read"),
  preview_check_route: R("read"), preview_diagnose: R("read"), deploy_status: R("read"), read_proposals: R("read"),
  deployment_preflight: R("read"), tool_search: R("read"), mcp_resources: R("read"), mcp_prompts: R("read"),
  write_file: R("reversible_write", true), write_files: R("reversible_write", true),
  save_memory: R("reversible_write", true), remember: R("reversible_write"), update_spec: R("reversible_write"),
  suggest_improvement: R("reversible_write"), ask_user: R("reversible_write"), share_file: R("reversible_write"),
  run_command: R("reversible_write", true), preview_start: R("reversible_write", true), preview_restart: R("reversible_write", true),
  preview_stop: R("reversible_write", true), apply_proposals: R("reversible_write", true), delegate: R("reversible_write"),
  review_vercel_issues: R("reversible_write", true), request_secret: R("external_effect"),
  delete_file: R("destructive", true), apply_migrations: R("destructive"),
  tool_invoke: R("external_effect"),
};

export function policyFor(name: string): ToolPolicy {
  return TOOL_POLICY[name] ?? R("external_effect");
}

/** Stable key: same tool + same canonical arguments within one task. */
export function idempotencyKey(taskId: string, name: string, args: unknown): string {
  return `${taskId}:${name}:${canonical(args)}`;
}
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

export type FailureKind = "validation" | "auth" | "rate_limit" | "conflict" | "quota" | "timeout" | "network" | "server" | "cancelled" | "other";

export function classifyFailure(err: unknown): FailureKind {
  const m = (err instanceof Error ? `${err.name} ${err.message}` : String(err)).toLowerCase();
  if (/abort|cancel/.test(m)) return "cancelled";
  if (/invalid input|validation|schema|required/.test(m)) return "validation";
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden|permission/.test(m)) return "auth";
  if (/\b429\b|rate.?limit|too many requests/.test(m)) return "rate_limit";
  if (/quota|budget|insufficient credit|\b402\b/.test(m)) return "quota";
  if (/\b409\b|conflict|sha.*(mismatch|does not match)/.test(m)) return "conflict";
  if (/timed? ?out|timeout|deadline/.test(m)) return "timeout";
  if (/network|fetch failed|econnreset|socket|enotfound/.test(m)) return "network";
  if (/\b5\d\d\b|internal server|bad gateway|unavailable/.test(m)) return "server";
  return "other";
}

/** Whether a failed call may still have taken effect. Reads never have side effects. */
export function sideEffectAfterFailure(policy: ToolPolicy, kind: FailureKind): SideEffectState {
  if (policy.risk === "read") return "none";
  if (kind === "validation" || kind === "auth" || kind === "rate_limit" || kind === "quota") return "none";
  if (kind === "timeout" || kind === "network" || kind === "cancelled") return "unknown";
  if (kind === "server") return "possible";
  return "possible";
}

/** Retry guidance (§8 retry policy). */
export function retryAdvice(policy: ToolPolicy, kind: FailureKind): string {
  switch (kind) {
    case "validation": return "Do not retry without changed, valid arguments.";
    case "auth": return "Stop. The task-pinned connection lacks access; ask the user to reconnect it. Never switch accounts.";
    case "rate_limit": return "Wait (honor Retry-After) before at most one bounded retry.";
    case "quota": return "Stop cleanly and report the quota/budget blocker.";
    case "conflict": return "Re-read current state and re-plan before writing again.";
    case "cancelled": return "Do not continue; the run was stopped.";
    default:
      return policy.risk === "read" || policy.idempotent
        ? "Safe to retry once after a short wait."
        : "The change may have happened. Read back the real state before any retry; never blindly repeat this write.";
  }
}

export type LedgerEntry = { key: string; name: string; risk: Risk; state: SideEffectState; at: number; result?: unknown };

/** Per-run execution ledger. Confirmed non-idempotent writes are never re-executed with identical arguments. */
export class ToolLedger {
  private entries = new Map<string, LedgerEntry>();
  constructor(readonly taskId: string) {}
  find(key: string) { return this.entries.get(key); }
  record(e: LedgerEntry) { this.entries.set(e.key, e); }
  list() { return [...this.entries.values()]; }
  ambiguous() { return this.list().filter((e) => e.state === "unknown" || e.state === "possible"); }
}

type AnyTool = { execute?: (input: never, options: never) => unknown } & Record<string, unknown>;

export type BrokerHooks = { onAmbiguous?: (e: LedgerEntry, kind: FailureKind) => void; onDeduped?: (e: LedgerEntry) => void };

/**
 * Wraps every tool's execute with ledger dedupe and failure classification. Tool schemas and
 * other fields pass through untouched so providers see the same manifest.
 */
export function brokerTools<T extends Record<string, unknown>>(tools: T, ledger: ToolLedger, hooks: BrokerHooks = {}): T {
  const out: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    const tool = t as AnyTool;
    if (typeof tool?.execute !== "function") { out[name] = t; continue; }
    const exec = tool.execute as (input: unknown, options: unknown) => unknown;
    const policy = policyFor(name);
    out[name] = {
      ...tool,
      execute: async (input: unknown, options: unknown) => {
        const key = idempotencyKey(ledger.taskId, name, input);
        const prior = ledger.find(key);
        if (prior && policy.risk !== "read" && !policy.idempotent) {
          if (prior.state === "confirmed") {
            hooks.onDeduped?.(prior);
            return { deduplicated: true, note: `Identical ${name} call already succeeded in this run; not executed again.`, previous: prior.result };
          }
          if (prior.state === "unknown" || prior.state === "possible") {
            return { blocked: true, sideEffect: prior.state, guardrail: { rule: "no-blind-retry", risk: policy.risk, why: `${name} is a ${policy.risk} action that is not safe to repeat, and its earlier identical call ended without a clear result.` }, note: `A previous identical ${name} call may have taken effect. Read back real state and change the arguments or confirm before retrying.` };
          }
        }
        try {
          const result = await exec(input, options);
          ledger.record({ key, name, risk: policy.risk, state: policy.risk === "read" ? "none" : "confirmed", at: Date.now(), result: policy.idempotent ? undefined : summarize(result) });
          return result;
        } catch (err) {
          const kind = classifyFailure(err);
          const state = sideEffectAfterFailure(policy, kind);
          const entry: LedgerEntry = { key, name, risk: policy.risk, state, at: Date.now() };
          ledger.record(entry);
          if (state === "unknown" || state === "possible") hooks.onAmbiguous?.(entry, kind);
          if (kind === "cancelled") throw err;
          const base = err instanceof Error ? err.message : String(err);
          throw new Error(`${base}\n[broker] risk=${policy.risk} failure=${kind} sideEffect=${state}. ${retryAdvice(policy, kind)}`);
        }
      },
    };
  }
  return out as T;
}

function summarize(v: unknown): unknown {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? null);
  return s && s.length > 500 ? `${s.slice(0, 500)}…` : v;
}
