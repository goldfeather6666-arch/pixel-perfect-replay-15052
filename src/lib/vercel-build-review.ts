import { redact } from "./engine/errors";

export type BuildFinding = { id: string; evidence: string };
const issueLine = /\bwarn(?:ing)?\b|\berror\b|deprecated|vulnerabilit|security advisory|unsupported|unresolved|exceed.{0,30}(?:limit|size)|chunks?.{0,40}larger|failed to/i;

/** Preserve early diagnostics as well as the end of the build, without leaking secrets. */
export function buildLogExcerpt(lines: string[]): string {
  const diagnostic = lines.filter((line) => issueLine.test(line)).slice(0, 60);
  return [...new Set([...diagnostic, ...lines.slice(-60)])].map((line) => redact(line, 600)).join("\n").slice(0, 18000);
}

export function vercelBuildFindings(log: string): BuildFinding[] {
  return [...new Set(log.split("\n").filter((line) => issueLine.test(line)).map((line) => redact(line, 600)))].slice(0, 40).map((evidence, i) => ({ id: `issue-${i + 1}`, evidence }));
}

export type FindingDecision = { id: string; disposition: "fix" | "advisory" | "blocked"; rationale: string };
export function reviewBuildFindings(findings: BuildFinding[], decisions: FindingDecision[]): string | null {
  if (decisions.length !== findings.length || new Set(decisions.map((d) => d.id)).size !== findings.length || findings.some((f) => !decisions.some((d) => d.id === f.id))) throw new Error("Review every finding exactly once using its current ID.");
  if (decisions.some((d) => d.rationale.trim().length < 12)) throw new Error("Explain the evidence and reason for every decision.");
  const unresolved = decisions.filter((d) => d.disposition !== "advisory");
  return unresolved.length ? `Vercel build issues remain: ${unresolved.map((d) => `${d.id}: ${redact(d.rationale, 240)}`).join("; ")}. Fix source/configuration and recheck the new commit, or report the access/provider blocker.` : null;
}