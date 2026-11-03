export const MAX_AUTO_RESUMES = 3;
export const RESUME_MESSAGE = "continue the previous command from saved progress (the previous execution stopped showing signs of life). Re-check current files and pending approvals; skip completed work and never repeat external actions with an uncertain outcome.";
export const RECOVERY_COOLDOWN_MS = 5 * 60_000;

type Secret = { session_id: string; attempts: number; updated_at?: string };
type Session = { id: string; running: boolean; stop_requested: boolean; updated_at: string };

/** Decides which stored runs to restart (dead, not stopped, under the limit) and which tokens to delete. */
export function resumeCandidates<S extends Secret>(secrets: S[], sessions: Session[], now: number, staleMs: number) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const resume: S[] = [];
  const clean: string[] = [];
  for (const sec of secrets) {
    const s = byId.get(sec.session_id);
    if (!s || !s.running || s.stop_requested || sec.attempts >= MAX_AUTO_RESUMES) { clean.push(sec.session_id); continue; }
    if (sec.updated_at && now - Date.parse(sec.updated_at) < RECOVERY_COOLDOWN_MS) continue;
    if (now - Date.parse(s.updated_at) >= staleMs) resume.push(sec);
  }
  return { resume, clean };
}

/** Silence beyond this releases the run's sandbox instead of leaving it held open forever. */
export const QUIET_MS = 10 * 60_000;

/** A run waiting on a person is idle on purpose — it is not stuck and must never be auto-stopped. */
export const HUMAN_WAIT_STAGES = ["AWAITING_APPROVAL", "AWAITING_INPUT"];

type Quiet = { id: string; user_id: string; running: boolean; stop_requested: boolean; updated_at: string; last_stage: string | null };

/** Decides which silent runs to stop, sparing anything the owner stopped or a person still owes. */
export function quietStopCandidates(sessions: Quiet[], now: number, quietMs = QUIET_MS) {
  return sessions.filter((s) => s.running && !s.stop_requested
    && now - Date.parse(s.updated_at) >= quietMs
    && !(s.last_stage && HUMAN_WAIT_STAGES.includes(s.last_stage)));
}

type Turn = { role: "user" | "assistant"; content: string; tools?: unknown[] };
const STALL_NOTE = /\n*(No signs of life detected\.[^\n]*|\S+ did not start replying within 4 minutes[^\n]*)\s*$/;

/**
 * Automatic recovery stays invisible in chat: it adds no user message and continues the interrupted
 * assistant reply (dropping its "no signs of life" note) instead of starting a new bubble.
 */
export function recoveryTurns<T extends Turn>(history: T[], autoRecovery: boolean) {
  const last = history.at(-1);
  const prev = autoRecovery && last?.role === "assistant" ? last : null;
  const base = prev ? history.slice(0, -1) : history;
  const prevText = prev ? prev.content.replace(STALL_NOTE, "").trimEnd() : "";
  return {
    base,
    assistant(text: string, tools: NonNullable<T["tools"]>): T {
      if (!prev) return { role: "assistant", content: text, tools } as T;
      return { ...prev, content: prevText && text ? `${prevText}\n\n${text}` : prevText || text, tools: [...(prev.tools ?? []), ...tools] } as T;
    },
  };
}
