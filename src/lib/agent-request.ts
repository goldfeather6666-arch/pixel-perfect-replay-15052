import { z } from "zod";

export const MAX_PROMPT_CHARS = 200_000;
export function promptError(message: string): string | null {
  if (!message.trim()) return "Enter a message before sending.";
  if (message.length > MAX_PROMPT_CHARS) return `Your prompt has ${message.length.toLocaleString("en-US")} characters. Forge accepts up to 200,000 per message; split it into smaller messages.`;
  return null;
}
const image = z.object({ mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]), data: z.string().max(7_000_000) });
export const agentRequest = z.object({ sessionId: z.string().uuid(), message: z.string().min(1).max(MAX_PROMPT_CHARS), plan: z.boolean().optional(), images: z.array(image).max(4).optional() });
export function requestError(issues: { path: PropertyKey[] }[], message?: unknown) {
  if (issues.some((issue) => issue.path[0] === "message") && typeof message === "string") return promptError(message) ?? "Invalid message.";
  if (issues.some((issue) => issue.path[0] === "images")) return "Attachments could not be accepted. Use up to four PNG, JPEG, WebP or GIF images under 5 MB each.";
  return "This request could not be accepted. Reopen the task and try again.";
}