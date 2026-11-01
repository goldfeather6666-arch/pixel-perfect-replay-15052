// Measured skill effectiveness from past runs: share of runs that loaded the skill and completed.
export type SkillStat = { loaded: number; completed: number };
export const MIN_SAMPLES = 4;

export function skillStats(rows: { skill_name: string; outcome: string | null }[]): Map<string, SkillStat> {
  const m = new Map<string, SkillStat>();
  for (const r of rows) {
    const s = m.get(r.skill_name) ?? { loaded: 0, completed: 0 };
    s.loaded++;
    if (r.outcome === "completed") s.completed++;
    m.set(r.skill_name, s);
  }
  return m;
}
/** null = not enough evidence. */
export function successRate(s: SkillStat | undefined): number | null {
  return s && s.loaded >= MIN_SAMPLES ? s.completed / s.loaded : null;
}
