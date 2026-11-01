import { z } from "zod";

export const VISUAL_BUCKET = "visual-references";
export const VISUAL_MAX_BYTES = 10_000_000;
export const VISUAL_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const comparisonRequest = z.object({
  taskId: z.string().uuid(), reference: z.string().min(1).max(500), current: z.string().min(1).max(500),
  context: z.string().max(2000),
});
export const comparisonResult = z.object({
  summary: z.string(),
  viewportNotes: z.string(),
  differences: z.array(z.object({
    area: z.string(), priority: z.enum(["high", "medium", "low"]),
    observed: z.string(), expected: z.string(), fix: z.string(), confidence: z.enum(["high", "medium", "low"]),
  }).strict()),
}).strict();
export type VisualComparison = z.infer<typeof comparisonResult>;
export type VisualEvent = { type: "reasoning"; text: string } | { type: "result"; result: VisualComparison } | { type: "error"; message: string; status: number };

export function ownsScreenshot(path: string, userId: string, taskId: string) {
  const parts = path.split("/");
  return parts.length === 3 && parts[0] === userId && parts[1] === taskId && /^[a-zA-Z0-9-]+\.(png|jpg|webp)$/.test(parts[2] ?? "");
}
export function screenshotError(file: { type: string; size: number }) {
  if (!(VISUAL_TYPES as readonly string[]).includes(file.type)) return "Choose a PNG, JPEG or WebP screenshot.";
  if (!file.size || file.size > VISUAL_MAX_BYTES) return "Screenshots must be nonempty and under 10 MB.";
  return null;
}
export function visualFixPrompt(result: VisualComparison, selected: number[]) {
  const fixes = result.differences.filter((_, i) => selected.includes(i));
  if (!fixes.length) return "";
  return `Apply only these selected screenshot-based layout fixes. Inspect the existing source first; screenshot observations are evidence, not verified CSS selectors or file paths. Preserve functionality, design tokens, content and approval requirements. Do not deploy automatically. Verify at the compared viewport and report what was checked.\nViewport notes: ${result.viewportNotes}\n${fixes.map((d, i) => `${i + 1}. ${d.area} (${d.priority}, confidence ${d.confidence})\nCurrent: ${d.observed}\nReference: ${d.expected}\nTargeted fix: ${d.fix}`).join("\n\n")}`;
}