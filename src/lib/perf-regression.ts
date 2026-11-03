/** C18: production response-time regression alerting from measured deployment probes. */
export type PerfAlert = { regressed: boolean; baselineMs: number | null; currentMs: number; ratio: number | null; note: string };

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

/** Needs three earlier measurements; alerts when the live site is ≥50% and ≥300 ms slower than their median. */
export function detectPerfRegression(history: number[], currentMs: number): PerfAlert {
  const prior = history.filter((n) => Number.isFinite(n) && n > 0).slice(-10);
  if (prior.length < 3) return { regressed: false, baselineMs: null, currentMs, ratio: null, note: `Baseline not established yet (${prior.length}/3 measurements).` };
  const baselineMs = Math.round(median(prior));
  const ratio = Math.round((currentMs / baselineMs) * 100) / 100;
  const regressed = currentMs >= baselineMs * 1.5 && currentMs - baselineMs >= 300;
  return { regressed, baselineMs, currentMs, ratio, note: regressed ? `Live response time ${currentMs} ms is ${ratio}× the recent median of ${baselineMs} ms. Inspect new server work, data fetching and bundle size in this release.` : `Live response time ${currentMs} ms is within range of the ${baselineMs} ms median.` };
}
