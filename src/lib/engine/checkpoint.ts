// Builds a resume checkpoint from a previous run's recorded milestones.
type Ev = { type: string; payload: unknown };

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "BLOCKED", "AWAITING_APPROVAL"]);

/** A run counts as interrupted when it never reached an end state and its heartbeat went quiet. */
export function isInterrupted(run: { stage: string; ended_at: string | null }, active: boolean): boolean {
  return !active && !run.ended_at && !TERMINAL.has(run.stage);
}

export function buildCheckpoint(run: { objective: string; stage: string; started_at: string }, events: Ev[], maxChars = 4000): string {
  const done = new Map<string, { n: number; failed: number }>();
  const agents: string[] = [];
  let memories = 0;
  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === "tool.execution.completed" && typeof p.tool === "string") {
      const t = done.get(p.tool) ?? { n: 0, failed: 0 };
      t.n++; if (p.ok === false) t.failed++;
      done.set(p.tool, t);
    } else if (e.type === "agent.completed" && typeof p.label === "string") agents.push(`${p.label} (${p.ok ? "done" : "failed"})`);
    else if (e.type === "memory.saved") memories++;
  }
  const tools = [...done].map(([k, v]) => `${k}×${v.n}${v.failed ? ` (${v.failed} failed)` : ""}`).join(", ");
  const text = [
    `Previous run was interrupted at stage ${run.stage} (started ${run.started_at}).`,
    `Its objective: ${run.objective.slice(0, 1200)}`,
    tools ? `Tools it completed: ${tools}.` : "It had not completed any tools.",
    agents.length ? `Specialists: ${agents.join(", ")}.` : "",
    memories ? `It saved ${memories} memory note(s).` : "",
    "Committed edits are already on the work branch; staged ones are in Changes. Re-check current file state, skip finished work, continue from where it stopped, and do not redo completed steps.",
  ].filter(Boolean).join("\n");
  return text.slice(0, maxChars);
}
