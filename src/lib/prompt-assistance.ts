import { z } from "zod";
import { MAX_PROMPT_CHARS } from "./agent-request";

export const assistanceRequest = z.object({
  sessionId: z.string().uuid(),
  draft: z.string().trim().min(20).max(MAX_PROMPT_CHARS),
});
export const assistanceResult = z.object({
  refined: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
  questions: z.array(z.string().trim().min(1).max(300)).max(3),
});
export function parseAssistance(text: string) {
  return assistanceResult.parse(JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")));
}
export type PromptSuggestion = { id: string; label: string; addition: string };
export function promptSuggestions(draft: string): PromptSuggestion[] {
  const text = draft.toLowerCase();
  if (text.trim().length < 8) return [];
  const options: PromptSuggestion[] = [];
  if (/design|ui|page|dashboard|website|layout|style/.test(text) && !/mobile|responsive/.test(text))
    options.push({
      id: "mobile",
      label: "Include mobile",
      addition: "Make the layout responsive on mobile, tablet and desktop.",
    });
  if (
    /auth|login|sign.in|database|payment|checkout/.test(text) &&
    !/permission|secure|security/.test(text)
  )
    options.push({
      id: "security",
      label: "Add security checks",
      addition:
        "Preserve existing data and enforce authentication, permissions and secure handling of private information.",
    });
  if (/fix|bug|error|broken|crash/.test(text) && !/reproduce/.test(text))
    options.push({
      id: "reproduce",
      label: "Find the root cause",
      addition:
        "Reproduce the issue first, fix its root cause, and rerun the same flow to verify it.",
    });
  if (!/test|verify|verification|check/.test(text))
    options.push({
      id: "verify",
      label: "Verify the result",
      addition:
        "Run the relevant tests and verify the finished experience. Report any checks that could not be completed.",
    });
  if (/build|add|create|implement/.test(text) && !/existing|preserve/.test(text))
    options.push({
      id: "preserve",
      label: "Keep existing behavior",
      addition:
        "Match the existing project conventions and preserve unrelated features and user data.",
    });
  return options.slice(0, 3);
}
export function appendSuggestion(draft: string, addition: string) {
  const next = `${draft.trimEnd()}\n\n${addition}`;
  return next.length <= MAX_PROMPT_CHARS ? next : draft;
}
export function canApplyAssistance(current: string, original: string, refined: string) {
  return current === original && refined.trim().length > 0 && refined.length <= MAX_PROMPT_CHARS;
}
