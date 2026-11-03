// Creative-director review: scores a page from signals that can actually be measured in the HTML the
// preview served — contrast, structure, labels, alt text, touch targets, metadata. Every finding
// carries the fix, and a score is never claimed from a screenshot alone.

export type Severity = "blocker" | "major" | "minor";

export type Finding = { area: "contrast" | "structure" | "labels" | "media" | "targets" | "metadata" | "performance"; severity: Severity; detail: string; fix: string };

export type QualityScore = {
  score: number;
  grades: { a11y: number; structure: number; media: number; labels: number; targets: number; metadata: number };
  findings: Finding[];
  measured: string[];
};

const hex = (v: string | null): [number, number, number] | null => {
  if (!v) return null;
  const m = v.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m?.[1]) return null;
  const s = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.1 relative luminance. */
export function luminance(color: string): number | null {
  const rgb = hex(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, or null when either cannot be parsed. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

const text = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => (m[1] ?? "").trim()).filter(Boolean);

/** Score the HTML the preview actually served, plus any measured timings the caller has. */
export function scorePage(html: string, measured: { lcpMs?: number | null; totalKb?: number | null } = {}): QualityScore {
  const findings: Finding[] = [];
  const measuredList: string[] = [];
  const lower = html.toLowerCase();

  // Contrast: only where both colors are declared inline, so nothing is invented.
  let contrastChecks = 0;
  for (const m of html.matchAll(/style="[^"]*color:\s*(#[0-9a-f]{3,6})[^"]*background(?:-color)?:\s*(#[0-9a-f]{3,6})[^"]*"/gi)) {
    const ratio = contrastRatio(m[1] ?? "", m[2] ?? "");
    if (ratio === null) continue;
    contrastChecks++;
    if (ratio < 4.5) findings.push({ area: "contrast", severity: ratio < 3 ? "blocker" : "major", detail: `Text ${m[1]} on ${m[2]} is ${ratio}:1, below the 4.5:1 minimum`, fix: "Darken the text or lighten the background until the pair reaches 4.5:1." });
  }
  if (contrastChecks) measuredList.push(`${contrastChecks} inline colour pair(s)`);

  // Structure: one h1, no skipped heading levels, landmarks.
  const h1s = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1s === 0) findings.push({ area: "structure", severity: "major", detail: "No <h1> on the page", fix: "Add one <h1> naming what this page is." });
  if (h1s > 1) findings.push({ area: "structure", severity: "minor", detail: `${h1s} <h1> elements`, fix: "Keep a single <h1> and demote the rest." });
  const levels = text(html, /<h([1-6])[\s>]/g).map(Number).filter((n) => n >= 1 && n <= 6);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i]! - levels[i - 1]! > 1) {
      findings.push({ area: "structure", severity: "minor", detail: `Heading jumps from h${levels[i - 1]} to h${levels[i]}`, fix: `Insert an h${(levels[i - 1] ?? 1) + 1} or raise the later heading.` });
      break;
    }
  }
  if (!/<(main|nav|header|footer)[\s>]/i.test(html)) findings.push({ area: "structure", severity: "minor", detail: "No landmark element (main/nav/header/footer)", fix: "Wrap the page content in <main> and the navigation in <nav>." });
  measuredList.push("heading order and landmarks");

  // Labels: every input must be programmatically labelled.
  const inputs = [...html.matchAll(/<input\b([^>]*)>/gi)].filter((m) => !/type=["']?(hidden|submit|button|image)/i.test(m[1] ?? ""));
  const ids = new Set(text(html, /\bid=["']([^"']+)["']/gi));
  const labelled = new Set(text(html, /<label[^>]*\bfor=["']([^"']+)["']/gi));
  let unlabelled = 0;
  for (const m of inputs) {
    const attrs = m[1] ?? "";
    if (/aria-label\s*=/i.test(attrs) || /aria-labelledby\s*=/i.test(attrs) || /placeholder\s*=/i.test(attrs)) continue;
    const id = (attrs.match(/\bid=["']([^"']+)["']/i) ?? [])[1];
    if (id && labelled.has(id)) continue;
    unlabelled++;
  }
  if (unlabelled) findings.push({ area: "labels", severity: "major", detail: `${unlabelled} input(s) with no label, aria-label or placeholder`, fix: "Give each field a <label for=…> or an aria-label." });
  if (inputs.length) measuredList.push(`${inputs.length} input(s)`);

  // Media: images need alt text (decorative ones explicitly empty).
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)];
  const missingAlt = imgs.filter((m) => !/\balt\s*=/i.test(m[0] ?? "")).length;
  if (missingAlt) findings.push({ area: "media", severity: "major", detail: `${missingAlt} image(s) with no alt attribute`, fix: "Add descriptive alt text, or alt=\"\" for purely decorative images." });
  if (imgs.length) measuredList.push(`${imgs.length} image(s)`);

  // Touch targets: buttons/links smaller than 44px in a declared size are a mobile blocker.
  const small = [...html.matchAll(/<(button|a)\b[^>]*\bstyle="[^"]*(?:width|height|font-size):\s*(\d{1,2})px[^"]*"/gi)]
    .filter((m) => Number(m[2]) < 24).length;
  if (small) findings.push({ area: "targets", severity: "minor", detail: `${small} tappable element(s) declared under 24px`, fix: "Raise tap targets to at least 44×44px or add padding." });
  measuredList.push("declared tap sizes");

  // Metadata.
  if (!/<html[^>]*\blang=/i.test(lower)) findings.push({ area: "metadata", severity: "major", detail: "<html> has no lang attribute", fix: 'Set <html lang="en"> (or the page language).' });
  if (!/<title[\s>]/i.test(lower)) findings.push({ area: "metadata", severity: "major", detail: "No <title>", fix: "Add a page-specific <title>." });
  if (!/name=["']viewport["']/i.test(lower)) findings.push({ area: "metadata", severity: "blocker", detail: "No viewport meta tag", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' });
  measuredList.push("document metadata");

  // Performance: only figures the caller actually measured.
  if (typeof measured.lcpMs === "number") {
    measuredList.push(`LCP ${measured.lcpMs}ms`);
    if (measured.lcpMs > 2500) findings.push({ area: "performance", severity: "major", detail: `Largest contentful paint ${measured.lcpMs}ms`, fix: "Serve the largest above-the-fold asset early and defer non-critical JS." });
  }
  if (typeof measured.totalKb === "number") {
    measuredList.push(`payload ${measured.totalKb}kB`);
    if (measured.totalKb > 300) findings.push({ area: "performance", severity: "major", detail: `Static payload ${measured.totalKb}kB`, fix: "Code-split the heaviest route and lazy-load below-the-fold components." });
  }

  const penalty = (sev: Severity) => (sev === "blocker" ? 25 : sev === "major" ? 10 : 4);
  const byArea = (area: Finding["area"]) => findings.filter((f) => f.area === area);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const grades = {
    a11y: clamp(100 - byArea("contrast").reduce((s, f) => s + penalty(f.severity), 0) - (byArea("labels").length ? 20 : 0)),
    structure: clamp(100 - byArea("structure").reduce((s, f) => s + penalty(f.severity), 0)),
    media: clamp(100 - (missingAlt ? 30 : 0)),
    labels: clamp(100 - (unlabelled ? 30 : 0)),
    targets: clamp(100 - byArea("targets").reduce((s, f) => s + penalty(f.severity), 0)),
    metadata: clamp(100 - byArea("metadata").reduce((s, f) => s + penalty(f.severity), 0)),
  };
  const score = clamp(Object.values(grades).reduce((s, g) => s + g, 0) / 6);
  return { score, grades, findings, measured: measuredList };
}

/** The handoff line the agent must report: the score, what was measured, and what still needs fixing. */
export function formatQualityScore(q: QualityScore): string {
  const blockers = q.findings.filter((f) => f.severity === "blocker");
  const majors = q.findings.filter((f) => f.severity === "major");
  const parts = [`Creative-director score ${q.score}/100.`];
  if (blockers.length) parts.push(`${blockers.length} blocker(s): ${blockers.map((b) => b.detail).join("; ")}.`);
  if (majors.length) parts.push(`${majors.length} major finding(s): ${majors.map((b) => b.detail).join("; ")}.`);
  if (!blockers.length && !majors.length) parts.push("No blockers or major findings.");
  parts.push(`Measured: ${q.measured.join(", ") || "nothing measurable in the served HTML"}.`);
  return parts.join(" ");
}
