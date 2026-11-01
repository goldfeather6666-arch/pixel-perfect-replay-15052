// Structured worker contract: every helper ends with a JSON report the master can validate.
import { z } from "zod";

export const WORKER_REPORT_INSTRUCTIONS = `End your final message with a JSON block fenced as \`\`\`report ... \`\`\` containing:
{"objective": string, "files_inspected": string[], "findings": string[], "assumptions": string[], "proposed_files": string[], "dependencies": string[], "conflicts": string[], "tests": [{"command": string, "outcome": string}], "unresolved": string[], "confidence_evidence": string, "handoff": string}
Only list tests you actually ran with their real outcome. Confidence is evidence, not a percentage.`;

const list = z.array(z.string().max(500)).max(40).default([]);
export const workerReportSchema = z.object({
  objective: z.string().max(1000).default(""),
  files_inspected: list,
  findings: list,
  assumptions: list,
  proposed_files: list,
  dependencies: list,
  conflicts: list,
  tests: z.array(z.object({ command: z.string().max(300), outcome: z.string().max(500) })).max(20).default([]),
  unresolved: list,
  confidence_evidence: z.string().max(1000).default(""),
  handoff: z.string().max(2000).default(""),
});
export type WorkerReport = z.infer<typeof workerReportSchema>;

/** Parses the fenced report; returns issues the master must reconcile (missing report, unowned files). */
export function parseWorkerReport(text: string, ownedPaths: string[], submitted: string[]): { report: WorkerReport | null; issues: string[] } {
  const m = text.match(/```report\s*([\s\S]*?)```/i) ?? text.match(/```json\s*(\{[\s\S]*"objective"[\s\S]*?\})\s*```/i);
  if (!m) return { report: null, issues: ["Helper did not return a structured report; verify its claims before integrating."] };
  let raw: unknown;
  try { raw = JSON.parse(m[1]!); } catch { return { report: null, issues: ["Helper report was not valid JSON."] }; }
  const parsed = workerReportSchema.safeParse(raw);
  if (!parsed.success) return { report: null, issues: ["Helper report did not match the worker contract."] };
  const issues: string[] = [];
  const unowned = parsed.data.proposed_files.filter((p) => ownedPaths.length && !ownedPaths.includes(p));
  if (unowned.length) issues.push(`Report claims files outside its ownership: ${unowned.join(", ")}`);
  const unclaimed = parsed.data.proposed_files.filter((p) => !submitted.includes(p));
  if (unclaimed.length && ownedPaths.length) issues.push(`Report lists files with no submitted proposal: ${unclaimed.join(", ")}`);
  return { report: parsed.data, issues };
}
