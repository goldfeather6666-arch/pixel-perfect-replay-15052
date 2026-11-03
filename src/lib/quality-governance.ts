/** C21: enforceable per-model quality floor and per-run cost budget, read from forge.policy.json. */
export type Governance = { minQualityScore?: number | Record<string, number>; maxRunCostUsd?: number };

/** Minimum score for a model: exact id, then a "*" default; undefined means no floor configured. */
export function minScoreFor(gov: Governance | undefined, model: string): number | undefined {
  const m = gov?.minQualityScore;
  if (m === undefined) return undefined;
  if (typeof m === "number") return m;
  return m[model] ?? m[model.split("/").pop() ?? model] ?? m["*"];
}

/** Deploy is blocked when a floor exists and the lowest measured route score is missing or below it. */
export function qualityGate(gov: Governance | undefined, model: string, lowestScore: number | null) {
  const min = minScoreFor(gov, model);
  if (min === undefined) return { ok: true, min: null as number | null, score: lowestScore, summary: "No minimum quality score configured." };
  if (lowestScore === null) return { ok: false, min, score: null, summary: `Policy requires a quality score of at least ${min} for ${model} before deploying; run quality_score on the main routes first.` };
  const ok = lowestScore >= min;
  return { ok, min, score: lowestScore, summary: ok ? `Quality ${lowestScore} meets the ${min} minimum for ${model}.` : `Quality ${lowestScore} is below the ${min} minimum for ${model}. Fix the reported findings and re-score before deploying.` };
}

export function costBudget(gov: Governance | undefined, costUsd: number | null) {
  const max = gov?.maxRunCostUsd;
  if (max === undefined) return { ok: true, max: null as number | null, costUsd };
  if (costUsd === null) return { ok: false, max, costUsd, summary: "Run cost is unknown for this model, so the cost budget is unverified." };
  return { ok: costUsd <= max, max, costUsd, summary: costUsd <= max ? `Run cost $${costUsd.toFixed(4)} is within the $${max} budget.` : `Run cost $${costUsd.toFixed(4)} exceeded the $${max} budget.` };
}
