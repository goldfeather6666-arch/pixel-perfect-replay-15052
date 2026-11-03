// Decides when approving staged external actions should wake the agent, and which mode a
// question/suggestion answer resumes in. Pure so the rules stay testable.

export type ActionState = "pending" | "succeeded" | "rejected" | "failed" | "running" | string;
export type AgentMode = "chat" | "plan" | "build";

/** Resume only once nothing is still waiting, and at least one action actually ran. */
export function shouldResumeAfterApproval(states: ActionState[]): boolean {
  if (!states.length) return false;
  if (states.some((s) => s === "pending" || s === "running")) return false;
  return states.some((s) => s === "succeeded" || s === "failed");
}

export function approvalResumeMessage(states: ActionState[]): string {
  const ok = states.filter((s) => s === "succeeded").length;
  const failed = states.filter((s) => s === "failed").length;
  const rejected = states.filter((s) => s === "rejected").length;
  const parts = [ok && `${ok} succeeded`, failed && `${failed} failed`, rejected && `${rejected} rejected`].filter(Boolean).join(", ");
  return `The external actions you staged were resolved (${parts}). Read their saved results, then continue the task from where you paused. Do not re-request actions that already succeeded.`;
}

/** forcePlan argument for send(): answers keep the user's current mode instead of forcing Build. */
export function resumeForcePlan(mode: AgentMode): boolean | undefined {
  return mode === "plan" ? true : mode === "build" ? false : undefined;
}

export const isResolvedAction = (s: ActionState) => s !== "pending" && s !== "running";
