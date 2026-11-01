import { z } from "zod";
import { productionInstructions } from "./deployment-quality";

export const MAX_SPLIT_TASK_CHARS = 20_000;
export const WORK_ROLES = ["master", "explorer", "coder", "tester"] as const;
export type WorkRole = (typeof WORK_ROLES)[number];

const item = z.object({
  role: z.enum(WORK_ROLES),
  title: z.string().min(1).max(120),
  details: z.string().max(2000).default(""),
  paths: z.array(z.string().max(300)).max(40).default([]),
  dependsOn: z.array(z.number().int().min(1)).max(20).default([]),
});

export const workSplitSchema = z.object({
  summary: z.string().max(1000).default(""),
  items: z.array(item).min(1).max(24),
});
export type WorkSplit = z.infer<typeof workSplitSchema>;

export const SPLIT_SYSTEM = `${productionInstructions}
You divide a production implementation into coordinated work, never a demo-first milestone. Include real integration, security, production configuration and acceptance verification in the relevant assignments. Roles:
- master: coordinates, merges coder proposals, final verification. Exactly one master item, first.
- explorer: read-only investigation of the repository.
- coder: edits files. Each coder owns distinct file paths; never assign the same path to two coders.
- tester: runs checks/tests and reports failures.
Reply with ONLY a JSON object: {"summary": string, "items": [{"role": "master"|"explorer"|"coder"|"tester", "title": string, "details": string, "paths": string[], "dependsOn": number[]}]}.
dependsOn holds 1-based item numbers that must finish first. Keep 3-12 items.`;

/** Extracts and validates the JSON plan from model text; enforces one master and no shared coder paths. */
export function parseWorkSplit(text: string): WorkSplit {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return a plan. Try again or pick a stronger model.");
  let raw: unknown;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error("The model returned an unreadable plan. Try again."); }
  const parsed = workSplitSchema.safeParse(raw);
  if (!parsed.success) throw new Error("The model's plan was missing required parts. Try again.");
  const plan = parsed.data;
  const masters = plan.items.filter((i) => i.role === "master");
  const others = plan.items.filter((i) => i.role !== "master");
  const master = masters[0] ?? { role: "master" as const, title: "Coordinate and verify", details: "", paths: [], dependsOn: [] };
  const items = [master, ...others];
  const n = items.length;
  const owned = new Set<string>();
  for (const [idx, it] of items.entries()) {
    it.dependsOn = [...new Set(it.dependsOn)].filter((d) => d >= 1 && d <= n && d !== idx + 1);
    if (it.role === "coder") it.paths = it.paths.filter((p) => (owned.has(p) ? false : (owned.add(p), true)));
  }
  return { summary: plan.summary, items };
}

/** Turns a plan into a message the master agent can execute with its team. */
export function workSplitPrompt(task: string, plan: WorkSplit): string {
  const lines = plan.items.map((it, i) => {
    const deps = it.dependsOn.length ? ` (after ${it.dependsOn.join(", ")})` : "";
    const paths = it.paths.length ? `\n   Files: ${it.paths.join(", ")}` : "";
    return `${i + 1}. [${it.role}] ${it.title}${deps}${it.details ? `\n   ${it.details}` : ""}${paths}`;
  });
  return `${task}\n\nCoordinated work plan (you are the master; delegate explorer/coder/tester items to your team in dependency order, keep coder file ownership exact):\n${lines.join("\n")}`;
}
