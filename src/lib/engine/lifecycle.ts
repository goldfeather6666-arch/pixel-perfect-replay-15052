// Run lifecycle. Mirrors public.engine_stage_allowed — keep both in sync.
export const STAGES = ["RECEIVED", "DISCOVERING", "PLANNING", "AWAITING_APPROVAL", "EXECUTING", "VERIFYING", "REPAIRING", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"] as const;
export type Stage = (typeof STAGES)[number];

const NEXT: Record<Stage, Stage[]> = {
  RECEIVED: ["DISCOVERING", "FAILED", "CANCELLED"],
  DISCOVERING: ["PLANNING", "EXECUTING", "FAILED", "CANCELLED", "BLOCKED"],
  PLANNING: ["AWAITING_APPROVAL", "EXECUTING", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"],
  EXECUTING: ["VERIFYING", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"],
  VERIFYING: ["EXECUTING", "REPAIRING", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"],
  REPAIRING: ["EXECUTING", "VERIFYING", "FAILED", "CANCELLED", "BLOCKED"],
  AWAITING_APPROVAL: [], COMPLETED: [], FAILED: [], CANCELLED: [], BLOCKED: [],
};

export function canTransition(from: Stage, to: Stage): boolean {
  return NEXT[from].includes(to);
}
export function isTerminal(stage: Stage): boolean {
  return NEXT[stage].length === 0;
}

/** Final stage from real run facts — never "completed" just because the model replied. */
export function finalStage(f: { aborted: boolean; errored: boolean; blocker: string | null; exhausted: boolean; plan: boolean; pendingChanges: number; stagedActions: number }): { stage: Stage; reason: string } {
  if (f.aborted) return { stage: "CANCELLED", reason: "Stopped by user" };
  if (f.errored) return { stage: "FAILED", reason: "Run failed with an error" };
  if (f.blocker) return { stage: "BLOCKED", reason: f.blocker };
  if (f.exhausted) return { stage: "BLOCKED", reason: "Step limit reached before the work was finished" };
  if (f.plan) return { stage: "AWAITING_APPROVAL", reason: "Plan ready for your approval" };
  if (f.pendingChanges > 0 || f.stagedActions > 0) return { stage: "AWAITING_APPROVAL", reason: `${f.pendingChanges} file change(s) and ${f.stagedActions} external action(s) need approval` };
  return { stage: "COMPLETED", reason: "Work finished and required checks did not report a blocker" };
}

/** Weighted progress from stages actually reached, not a guess. */
export function stageProgress(reached: Stage[]): number {
  const w: Partial<Record<Stage, number>> = { RECEIVED: 5, DISCOVERING: 15, PLANNING: 25, EXECUTING: 55, VERIFYING: 80, REPAIRING: 80 };
  const last = reached[reached.length - 1];
  if (!last) return 0;
  if (last === "COMPLETED") return 100;
  return Math.max(0, ...reached.map((s) => w[s] ?? 0));
}
