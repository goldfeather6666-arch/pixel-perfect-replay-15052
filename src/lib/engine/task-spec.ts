// Task specification and sizing (handbook §3). Pure, provider-neutral.
import type { Stage } from "./lifecycle";
import type { CompletionState } from "./constitution";

export type RiskTier = "small" | "medium" | "large" | "high_risk";

export type AcceptanceCriterion = { id: string; text: string; required: boolean; verification: string };

export type TaskSpec = {
  taskId: string; runId?: string; parentTaskId?: string; idempotencyKey?: string;
  request: string; objective: string; domain: string; intent: string;
  inScope: string[]; exclusions: string[]; constraints: string[]; assumptions: string[];
  inputs: string[]; deliverables: string[];
  acceptanceCriteria: AcceptanceCriterion[]; verificationProcedure: string;
  dependencies: string[]; budget: { maxSteps: number; timeoutSeconds: number; retryLimit: number };
  riskTier: RiskTier;
  pinnedResources: { github?: string; database?: string; vercel?: string };
  requiredSkills: string[]; requiredCapabilities: string[];
  planVersion: number;
};

export const SIZING_METHOD: Record<RiskTier, string> = {
  small: "Inspect relevant area → act → targeted verification → concise report.",
  medium: "Create short plan, perform bounded steps, test and review.",
  large: "Version task spec, decompose into dependency waves, assign exclusive ownership and integrate.",
  high_risk: "Add threat/risk analysis, rollback plan, explicit approval and independent review.",
};

export const DEFAULT_BUDGET: Record<RiskTier, TaskSpec["budget"]> = {
  small: { maxSteps: 20, timeoutSeconds: 600, retryLimit: 2 },
  medium: { maxSteps: 40, timeoutSeconds: 1200, retryLimit: 3 },
  large: { maxSteps: 80, timeoutSeconds: 2400, retryLimit: 3 },
  high_risk: { maxSteps: 80, timeoutSeconds: 2400, retryLimit: 1 },
};

/** Problems that make a spec unfit to execute. Empty list = valid. */
export function specProblems(s: TaskSpec): string[] {
  const p: string[] = [];
  if (!s.objective.trim()) p.push("objective is empty");
  if (s.acceptanceCriteria.length === 0) p.push("no acceptance criteria");
  if (!s.acceptanceCriteria.some((c) => c.required)) p.push("no required acceptance criterion");
  for (const c of s.acceptanceCriteria) if (!c.verification.trim()) p.push(`criterion ${c.id} has no verification method`);
  const ids = s.acceptanceCriteria.map((c) => c.id);
  if (new Set(ids).size !== ids.length) p.push("duplicate acceptance criterion ids");
  const overlap = s.inScope.filter((x) => s.exclusions.includes(x));
  if (overlap.length) p.push(`in-scope items also excluded: ${overlap.join(", ")}`);
  if (s.budget.maxSteps <= 0 || s.budget.timeoutSeconds <= 0) p.push("budget must be positive");
  if (s.riskTier === "high_risk" && !s.constraints.some((c) => /rollback/i.test(c))) p.push("high-risk task needs a rollback constraint");
  return p;
}

/** Report vocabulary for a lifecycle stage before acceptance evidence is weighed. */
export function stageToCompletion(stage: Stage): CompletionState {
  switch (stage) {
    case "RECEIVED": return "NOT_STARTED";
    case "DISCOVERING": case "PLANNING": return "PLANNED";
    case "EXECUTING": case "VERIFYING": case "REPAIRING": return "IN_PROGRESS";
    case "AWAITING_INPUT": case "AWAITING_APPROVAL": case "BLOCKED": return "BLOCKED";
    case "FAILED": case "CANCELLED": return "FAILED";
    case "COMPLETED": return "COMPLETED_UNVERIFIED"; // upgraded only by completionState() with evidence
  }
}

export const planningRules = `TASK SPECIFICATION & PLANNING (UAF §3)
Lifecycle: RECEIVED → DISCOVERING → PLANNING → AWAITING_INPUT / AWAITING_APPROVAL / EXECUTING → VERIFYING → REPAIRING (if needed) → VERIFIED_COMPLETE / PARTIALLY_COMPLETED / FAILED / BLOCKED.
Sizing: ${(Object.keys(SIZING_METHOD) as RiskTier[]).map((k) => `${k}: ${SIZING_METHOD[k]}`).join(" | ")}
Planning rules:
1. Translate the request into observable outcomes, not vague activities.
2. Identify what must not change.
3. Inspect current state and project conventions before planning implementation.
4. Separate dependencies from independent work.
5. Choose the smallest complete path and state assumptions.
6. Define a verification method before making changes.
7. Set budget, retry limit, timeout and cancellation behavior.
8. Re-plan when new evidence invalidates assumptions; record the reason.`;
