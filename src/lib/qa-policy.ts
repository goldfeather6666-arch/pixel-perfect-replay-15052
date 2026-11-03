import { z } from "zod";
import type { GateStep } from "./engine/qa-gate";

export const qaPolicySchema = z.object({
  version: z.literal(1),
  requiredChecks: z.array(z.enum(["lint", "typecheck", "test", "build", "e2e", "a11y", "lighthouse"])).min(1).max(7),
}).strict();
export type QaPolicy = z.infer<typeof qaPolicySchema>;
export function parseQaPolicy(text: string): { policy?: QaPolicy; error?: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: "forge.policy.json must contain valid JSON." }; }
  const result = qaPolicySchema.safeParse(raw);
  return result.success ? { policy: result.data } : { error: "forge.policy.json requires version 1 and a nonempty requiredChecks list of supported checks; unknown settings are rejected." };
}
const aliases: Record<string, string> = { "type-check": "typecheck", "check-types": "typecheck", "test:e2e": "e2e", "test:a11y": "a11y" };
export function evaluateQaPolicy(policy: QaPolicy, steps: GateStep[]) {
  const passed = new Set(steps.filter((s) => s.exit === 0).map((s) => aliases[s.name] ?? s.name));
  const required = [...new Set(policy.requiredChecks)];
  const missing = required.filter((name) => !passed.has(name));
  return { ok: missing.length === 0, required, missing, summary: missing.length ? `Required checks lack passing evidence: ${missing.join(", ")}. Add the missing scripts or fix failures and rerun production checks.` : "All policy-required checks passed." };
}