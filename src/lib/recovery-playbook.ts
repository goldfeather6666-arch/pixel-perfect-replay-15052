// Recovery / replay: resume a partially completed effort from its saved state, never redo it.
// Pure — it reads only what the previous run actually recorded and current task state, so the
// brief separates provably-done work from unverified work instead of trusting a model's memory.

export type RecoveryEvent = { type: string; payload: unknown };

export type RecoveryState = {
  objective: string;
  stage: string;
  startedAt: string;
  pendingChanges: number;
  pendingApprovals: number;
  openQuestions: number;
  lastError?: string | null;
  failingCheck?: string | null;
  failingKind?: string | null;
};

export type RecoveryFacts = {
  provablyDone: string[];
  unverified: string[];
  externalUncertain: string[];
  reproduceFirst: string | null;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Splits an interrupted run's recorded events into provably done, unverified and externally
 * uncertain work. Only a tool completion that reported success counts as done; an ambiguous or
 * failed action never does, because repeating a side effect is more expensive than re-checking it.
 */
export function recoveryFacts(state: RecoveryState, events: RecoveryEvent[]): RecoveryFacts {
  const done = new Map<string, { ok: number; failed: number }>();
  const agents = new Map<string, boolean>();
  const externals = new Map<string, "confirmed" | "uncertain">();
  let memories = 0;
  let specs = 0;
  let checksPassed = false;
  let checksFailed: string | null = null;

  for (const e of events) {
    const p = obj(e.payload);
    if (e.type === "tool.execution.completed" && typeof p.tool === "string") {
      const cur = done.get(p.tool) ?? { ok: 0, failed: 0 };
      if (p.ok === false) cur.failed++;
      else cur.ok++;
      done.set(p.tool, cur);
    } else if (e.type === "agent.completed" && typeof p.label === "string") {
      agents.set(p.label, p.ok === true);
    } else if (e.type === "memory.saved") memories++;
    else if (e.type === "spec.updated") specs++;
    else if (e.type === "qa.gate") {
      if (p.passed === true) checksPassed = true;
      else if (typeof p.failedStep === "string") checksFailed = p.failedStep;
    } else if (e.type === "merge.conflict" || e.type === "tool.ambiguous") {
      const name = str(p.path) || str(p.tool) || "an action";
      externals.set(name, "uncertain");
    } else if (e.type === "deployment.attempt" || e.type === "mcp.action.staged") {
      const name = str(p.tool) || str(p.commit) || "an external action";
      externals.set(name, externals.get(name) === "confirmed" ? "confirmed" : "uncertain");
    }
  }

  const provablyDone: string[] = [];
  const unverified: string[] = [];
  for (const [tool, t] of done) {
    if (t.ok > 0) provablyDone.push(`${tool} ran successfully ${t.ok}×`);
    if (t.failed > 0) unverified.push(`${tool} failed ${t.failed}× and its last result was never confirmed`);
  }
  for (const [label, ok] of agents) (ok ? provablyDone : unverified).push(`specialist "${label}" ${ok ? "finished with a validated report" : "ended without a validated report"}`);
  if (specs) provablyDone.push(`the task specification was saved ${specs}×`);
  if (memories) provablyDone.push(`${memories} project memory note(s) were written`);
  if (checksPassed) provablyDone.push("project checks passed for this run");
  else unverified.push("project checks never reached a passing result in this run");
  if (state.pendingChanges > 0) unverified.push(`${state.pendingChanges} file change(s) are staged but not approved or committed`);
  if (state.pendingApprovals > 0) unverified.push(`${state.pendingApprovals} external action(s) are waiting for approval`);
  if (state.openQuestions > 0) unverified.push(`${state.openQuestions} question(s) still need an answer`);

  const externalUncertain = [...externals.entries()].map(([name, state2]) => `${name} (${state2 === "confirmed" ? "confirmed applied" : "outcome unknown"})`);
  const reproduceFirst = state.failingCheck
    ? `Reproduce the failure first: re-run the check that stopped the run (${state.failingCheck}${state.failingKind ? `, kind: ${state.failingKind}` : ""}) and read the real error before editing anything.`
    : state.lastError
      ? `Reproduce the failure first: "${state.lastError.slice(0, 200)}" must be seen again before anything is changed.`
      : null;

  return { provablyDone, unverified, externalUncertain, reproduceFirst };
}

/** The recovery-engineer brief injected into a resumed run: resume from saved state, never restart. */
export function recoveryBrief(state: RecoveryState, events: RecoveryEvent[], maxChars = 4000): string {
  const f = recoveryFacts(state, events);
  const lines = [
    `RECOVERY / REPLAY — resume, do not restart. Previous run stopped at stage ${state.stage} (started ${state.startedAt}).`,
    `Its objective: ${state.objective.slice(0, 800)}`,
    f.reproduceFirst ?? "No failing check was recorded: confirm the current state by inspection before making any change.",
    f.provablyDone.length ? `PROVABLY DONE — skip these, do not repeat them:\n${f.provablyDone.map((s) => `- ${s}`).join("\n")}` : "PROVABLY DONE — nothing yet; treat all work as still to do.",
    f.unverified.length ? `UNVERIFIED — check the real state before relying on any of it:\n${f.unverified.map((s) => `- ${s}`).join("\n")}` : "UNVERIFIED — nothing outstanding.",
    f.externalUncertain.length ? `EXTERNAL ACTIONS WITH UNCERTAIN OUTCOME — never repeat one; reconcile its state first:\n${f.externalUncertain.map((s) => `- ${s}`).join("\n")}` : "",
    "RULES: 1) Inspect the current repository and pending changes; never assume an earlier commit or write landed. 2) Fix the root cause, then re-run the same failing journey end-to-end. 3) Skip everything listed as provably done. 4) Finish with four short sections for the user: What was done, What failed, What was fixed, What remains.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, maxChars);
}
