import type { BudgetMetric } from "./perf-budget";
export type VerificationEvent = { id: string; run_id: string; type: string; created_at: string; payload: unknown };
export type VerificationRecord = {
  id: string; runId: string; at: string; kind: "budget" | "policy"; commit: string | null; root: string;
  status: "passed" | "failed" | "unmeasured" | "stale";
  measurements: { metric: BudgetMetric; actual: number | null; limit: number }[];
  missing: string[];
};
const metrics: BudgetMetric[] = ["jsKb", "cssKb", "totalKb", "lcpMs", "cls"];
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
/** Historical events without exact commit evidence are never presented as measured passes. */
export function verificationHistory(events: VerificationEvent[]): VerificationRecord[] {
  return events.filter((e) => e.type === "budget.check" || e.type === "policy.check")
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50).map((e) => {
      const p = obj(e.payload), measured = obj(p["measured"]), limits = obj(p["limits"]);
      const commit = typeof p["commit"] === "string" && /^[a-f0-9]{40,64}$/i.test(p["commit"]) ? p["commit"] : null;
      const measurements = metrics.flatMap((metric) => {
        const limit = number(limits[metric]);
        return limit === null ? [] : [{ metric, limit, actual: number(measured[metric]) }];
      });
      const missing = Array.isArray(p["missing"]) ? p["missing"].filter((v): v is string => typeof v === "string").slice(0, 7) : [];
      const unmeasured = e.type === "budget.check" ? !measurements.length || measurements.some((m) => m.actual === null) : !Array.isArray(p["required"]);
      const status = p["valid"] === false ? "stale" : p["ok"] === false && !unmeasured ? "failed" : !commit || unmeasured || typeof p["ok"] !== "boolean" ? "unmeasured" : p["ok"] ? "passed" : "failed";
      return { id: e.id, runId: e.run_id, at: e.created_at, kind: e.type === "budget.check" ? "budget" : "policy", commit, root: typeof p["root"] === "string" ? p["root"] : ".", status, measurements, missing };
    });
}