// Performance budget-as-code: a repo commits budget.json, the agent measures what it can, and a
// breach blocks the quality gate with the fix suggestion attached. A metric that could not be
// measured is reported as unmeasured — it never counts as passing.

export type BudgetMetric = "lcpMs" | "cls" | "jsKb" | "cssKb" | "totalKb";
export type PerfBudget = Partial<Record<BudgetMetric, number>>;
export type Measured = Partial<Record<BudgetMetric, number | null>>;

export type Violation = { metric: BudgetMetric; limit: number; actual: number; hint: string };
export type BudgetResult = { ok: boolean; violations: Violation[]; unmeasured: BudgetMetric[]; checked: BudgetMetric[] };

const METRICS: BudgetMetric[] = ["lcpMs", "cls", "jsKb", "cssKb", "totalKb"];

const HINT: Record<BudgetMetric, string> = {
  lcpMs: "Serve the largest above-the-fold image early (fetchpriority=high, no lazy-load on it), defer non-critical JS, and preconnect to the origin that serves it.",
  cls: "Give every image, embed and ad slot explicit width/height or aspect-ratio, and reserve space for fonts with size-adjust or font-display: optional.",
  jsKb: "Code-split the heaviest route, lazy-load below-the-fold components, and check for a dependency that only a small part of the app uses.",
  cssKb: "Remove unused utility classes, split route-level styles, and avoid importing a full component-library stylesheet for one widget.",
  totalKb: "Trim the whole payload: code-split the largest route, replace a heavy dependency, and lazy-load anything below the fold.",
};

const LABEL: Record<BudgetMetric, string> = {
  lcpMs: "largest contentful paint",
  cls: "cumulative layout shift",
  jsKb: "JavaScript payload",
  cssKb: "CSS payload",
  totalKb: "total static payload",
};

/** Read a committed budget.json. Unknown keys and bad values are rejected so a typo never silently disables a check. */
export function parsePerfBudget(text: string): { budget: PerfBudget; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { budget: {}, error: "budget.json must contain valid JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { budget: {}, error: "budget.json must be an object of limits, e.g. {\"lcpMs\":2500}." };
  const obj = raw as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => !METRICS.includes(k as BudgetMetric));
  if (unknown.length) return { budget: {}, error: `budget.json has unknown limits: ${unknown.join(", ")}. Allowed: ${METRICS.join(", ")}.` };
  const budget: PerfBudget = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return { budget: {}, error: `budget.json ${k} must be a non-negative number, got ${JSON.stringify(v)}.` };
    }
    budget[k as BudgetMetric] = v;
  }
  if (!Object.keys(budget).length) return { budget: {}, error: "budget.json declares no limits. Add at least one, e.g. {\"jsKb\":200}." };
  return { budget };
}

/** Sum built asset sizes into payload figures, ignoring maps and source files. */
export function payloadKb(files: { path: string; bytes: number }[]): Measured {
  const clean = files.filter((f) => !f.path.endsWith(".map") && !f.path.includes("node_modules"));
  const sum = (exts: string[]) =>
    clean.filter((f) => exts.some((e) => f.path.endsWith(e))).reduce((n, f) => n + Math.max(0, f.bytes), 0) / 1024;
  const jsKb = sum([".js", ".mjs"]);
  const cssKb = sum([".css"]);
  return { jsKb: Math.round(jsKb * 10) / 10, cssKb: Math.round(cssKb * 10) / 10, totalKb: Math.round((jsKb + cssKb) * 10) / 10 };
}

export function evaluateBudget(budget: PerfBudget, measured: Measured): BudgetResult {
  const violations: Violation[] = [];
  const unmeasured: BudgetMetric[] = [];
  const checked: BudgetMetric[] = [];
  for (const metric of METRICS) {
    const limit = budget[metric];
    if (limit === undefined) continue;
    const actual = measured[metric];
    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      unmeasured.push(metric);
      continue;
    }
    checked.push(metric);
    if (actual > limit) violations.push({ metric, limit, actual, hint: HINT[metric] });
  }
  return { ok: violations.length === 0 && unmeasured.length === 0, violations, unmeasured, checked };
}

/** One-line report the agent and the chat both read. */
export function formatBudgetResult(r: BudgetResult): string {
  const parts: string[] = [];
  if (r.violations.length) {
    parts.push(`Performance budget breached: ${r.violations.map((v) => `${LABEL[v.metric]} ${round(v.actual)} over ${round(v.limit)}`).join("; ")}.`);
    for (const v of r.violations) parts.push(`- ${LABEL[v.metric]}: ${v.hint}`);
  } else if (r.checked.length) {
    parts.push(`Performance budget met: ${r.checked.map((m) => LABEL[m]).join(", ")}.`);
  }
  if (r.unmeasured.length) parts.push(`Not measured (no evidence either way): ${r.unmeasured.map((m) => LABEL[m]).join(", ")}.`);
  return parts.join(" ");
}

const round = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 100) / 100);

/** Read `find … -printf '%p %s\n'` output from the build folder into asset sizes. */
export function parseAssetListing(text: string): { path: string; bytes: number }[] {
  const out: { path: string; bytes: number }[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(.*\.(?:js|mjs|css)) (\d+)$/);
    if (m?.[1] && m[2]) out.push({ path: m[1], bytes: Number(m[2]) });
  }
  return out;
}
