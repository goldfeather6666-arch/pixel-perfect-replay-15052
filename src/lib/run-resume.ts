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
