// Verification-first delivery. Every deliverable ships with proof: acceptance criteria are stated
// first, checks run cheapest-first, and the handoff ends with a table of measured results. Rows are
// built only from checks that actually ran — a missing run is always "unverified", never a pass.

export const VERIFICATION_LADDER = ["typecheck", "lint", "unit", "build", "preview", "e2e"] as const;
export type LadderRung = (typeof VERIFICATION_LADDER)[number];

/** Cheapest real signal first; each rung gates the next so expensive checks never mask a cheap failure. */
export const RUNG_ORDER: Record<LadderRung, number> = VERIFICATION_LADDER.reduce(
  (acc, rung, i) => ({ ...acc, [rung]: i }),
  {} as Record<LadderRung, number>,
);

export const VERIFICATION_FIRST_RULES = `VERIFICATION-FIRST DELIVERY (global rule)
1. State the acceptance criteria BEFORE implementing: one observable outcome per line, with the check that proves it.
2. Verify cheapest-first and stop at the first failure: typecheck -> lint -> unit tests -> production build -> live preview route check -> end-to-end. Fix the current rung before paying for the next.
3. Attach measured results, not assertions: exact command, exact exit code or measured figure, and what was not run.
4. Anything that could not run in this environment is reported as UNVERIFIED with the reason — never as passing, never as "should work".
5. End every handoff with the evidence table: item | criteria | test run | result (pass / fail / unverified). One row per acceptance criterion, plus one row per required check.`;

export type CheckRun = {
  /** Logical name of the check: "typecheck", "test", "build", "preview: /", "budget", "policy", ... */
  name: string;
  /** Real exit code for shell checks, HTTP status for route probes, null when it never ran. */
  exit: number | null;
  ms?: number | null;
};

export type EvidenceItem = { item: string; criteria: string; check?: CheckRun };

export type EvidenceRow = {
  item: string;
  criteria: string;
  testRun: string;
  result: "pass" | "fail" | "unverified";
};

/** A check proves something only when it actually ran and reported success. */
export function checkPassed(c: CheckRun | undefined): boolean {
  if (!c) return false;
  if (c.exit === null || c.exit === undefined) return false;
  return c.exit === 0;
}

/**
 * Pair each acceptance criterion with the check that actually proves it. Matching is deliberately
 * conservative: an unmatched criterion stays unverified instead of borrowing an unrelated pass.
 */
export function criteriaToItems(criteria: { text: string; required?: boolean }[], checks: CheckRun[]): EvidenceItem[] {
  return criteria.map((c) => ({
    item: c.text.slice(0, 160),
    criteria: c.required === false ? "optional" : "required",
    check: matchCheck(c.text, checks),
  }));
}

const SYNENTS: Record<string, string[]> = {
  typecheck: ["type", "tsc", "typescript", "compile"],
  lint: ["lint", "eslint", "style"],
  unit: ["test", "spec", "unit", "vitest", "jest"],
  build: ["build", "bundle", "production"],
  preview: ["preview", "route", "page", "screen", "browser", "url", "sign", "login", "journey"],
  e2e: ["e2e", "end-to-end", "playwright", "cypress"],
};

function matchCheck(text: string, checks: CheckRun[]): CheckRun | undefined {
  const t = text.toLowerCase();
  for (const rung of VERIFICATION_LADDER) {
    if (!SYNENTS[rung]?.some((k) => t.includes(k))) continue;
    const hit = checks.find((c) => c.name.toLowerCase().includes(rung) || (rung === "preview" && c.name.startsWith("preview")) || (rung === "unit" && /^(test|vitest|jest)$/.test(c.name.toLowerCase())));
    if (hit) return hit;
  }
  return undefined;
}

/** The handoff table: pass only on measured success, fail on measured failure, unverified otherwise. */
export function evidenceRows(items: EvidenceItem[]): EvidenceRow[] {
  return items.map(({ item, criteria, check }) => ({
    item,
    criteria,
    testRun: check ? `${check.name}${check.exit === null ? " (did not finish)" : ` (exit ${check.exit})`}` : "no check ran",
    result: !check || check.exit === null ? "unverified" : check.exit === 0 ? "pass" : "fail",
  }));
}

/** True when every required row passed — the only state a handoff may call verified. */
export function allRequiredPassed(rows: EvidenceRow[]): boolean {
  const required = rows.filter((r) => r.criteria === "required");
  return required.length > 0 && required.every((r) => r.result === "pass");
}

/** Render the table for chat: pipe-delimited rows with a header, exactly what the rule asks for. */
export function renderEvidenceTable(rows: EvidenceRow[]): string {
  const head = "item | criteria | test run | result";
  const body = rows.map((r) => `${r.item} | ${r.criteria} | ${r.testRun} | ${r.result}`);
  return [head, ...body].join("\n");
}
