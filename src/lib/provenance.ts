// Prompt audit chain: turns raw provenance rows and QA-gate results into the drill-down a
// reviewer reads — one step per request, each carrying the files it changed and the checks that
// actually ran for it. A change only counts as verified when a passing check exists for the run
// that made it; nothing is reported as verified on assumption.

export type ProvenanceChange = {
  runId: string | null;
  tool: string;
  action: string;
  prompt: string;
  createdAt: string;
};

export type GateEvidence = {
  runId: string;
  passed: unknown;
  cached: unknown;
  failedStep: unknown;
  failureKind: unknown;
  totalMs: unknown;
  createdAt: string;
};

export type ProvenanceStep = {
  runId: string | null;
  prompt: string;
  changes: ProvenanceChange[];
  evidence: GateEvidence[];
  verified: boolean;
  failed: boolean;
  unverified: boolean;
  latest: string;
};

export type ProvenanceChain = { steps: ProvenanceStep[]; criteria: string[] };

const byTime = (a: { createdAt: string }, b: { createdAt: string }) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

export function provenanceChain(
  changes: ProvenanceChange[],
  evidence: GateEvidence[],
  criteria: string[],
): ProvenanceChain {
  const groups = new Map<string, ProvenanceChange[]>();
  for (const c of changes) {
    const key = c.runId ?? "untracked";
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  const steps: ProvenanceStep[] = [...groups.entries()].map(([key, list]) => {
    const runId = key === "untracked" ? null : key;
    const rows = evidence.filter((e) => runId !== null && e.runId === runId);
    const passed = rows.some((e) => e.passed === true);
    const failed = rows.length > 0 && !passed;
    return {
      runId,
      prompt: [...list].sort(byTime)[0]?.prompt ?? "",
      changes: [...list].sort(byTime),
      evidence: [...rows].sort(byTime),
      verified: passed,
      failed,
      unverified: rows.length === 0,
      latest: [...list].sort(byTime)[0]?.createdAt ?? "",
    };
  });
  return { steps: steps.sort((a, b) => byTime({ createdAt: a.latest }, { createdAt: b.latest })), criteria };
}

/** Plain-language outcome for one step of the chain, with the check that decided it. */
export function stepOutcome(s: ProvenanceStep): { label: string; ok: boolean | null } {
  if (s.verified) return { label: "Verified by checks", ok: true };
  if (s.failed) {
    const first = s.evidence.find((e) => e.failedStep != null);
    const at = first ? ` at ${String(first.failedStep)}` : "";
    const kind = first?.failureKind ? ` · ${String(first.failureKind)}` : "";
    return { label: `Checks failed${at}${kind}`, ok: false };
  }
  return { label: "No checks recorded", ok: null };
}
