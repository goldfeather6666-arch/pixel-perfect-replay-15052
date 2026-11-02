import { z } from "zod";

export const MAX_PROMPT_CHARS = 300_000;
export function promptCapacity(message: string) {
  const used = message.length;
  const remaining = MAX_PROMPT_CHARS - used;
  return { used, remaining, nearLimit: remaining >= 0 && remaining <= MAX_PROMPT_CHARS / 10, overLimit: remaining < 0 };
}
export function promptError(message: string): string | null {
  if (!message.trim()) return "Enter a message before sending.";
  if (message.length > MAX_PROMPT_CHARS) return `Your prompt has ${message.length.toLocaleString("en-US")} characters. Forge accepts up to ${MAX_PROMPT_CHARS.toLocaleString("en-US")} per message; split it into smaller messages.`;
  return null;
}
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const DOC_TYPES = ["application/pdf", "text/plain", "text/markdown", "text/csv", "application/json"] as const;
export const ATTACH_ACCEPT = [...IMAGE_TYPES, ...DOC_TYPES, ".md", ".txt", ".csv", ".json", ".pdf"].join(",");
export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 10_000_000;
/** Browsers often report "" for .md/.csv; map by extension. */
export function attachmentType(name: string, type: string): string | null {
  if ((IMAGE_TYPES as readonly string[]).includes(type) || (DOC_TYPES as readonly string[]).includes(type)) return type;
  const ext = name.toLowerCase().split(".").pop();
  return ({ md: "text/markdown", markdown: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[ext ?? ""] ?? null;
}
const image = z.object({ mediaType: z.enum([...IMAGE_TYPES, ...DOC_TYPES]), data: z.string().max(14_000_000), name: z.string().max(200).optional() });
/** Converts one attachment into a model message part. Text documents are inlined; PDFs go as file parts. */
export function attachmentPart(a: { mediaType: string; data: string; name?: string | undefined }) {
  if (a.mediaType.startsWith("image/")) return { type: "image" as const, image: a.data, mediaType: a.mediaType };
  if (a.mediaType === "application/pdf") return { type: "file" as const, data: a.data, mediaType: a.mediaType, ...(a.name ? { filename: a.name } : {}) };
  const bytes = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0));
  return { type: "text" as const, text: `<attached_file name="${a.name ?? "document"}">\n${new TextDecoder().decode(bytes).slice(0, 200_000)}\n</attached_file>` };
}
export const agentRequest = z.object({ sessionId: z.string().uuid(), message: z.string().min(1).max(MAX_PROMPT_CHARS), plan: z.boolean().optional(), mode: z.enum(["chat", "plan", "build"]).optional(), publish: z.boolean().optional(), images: z.array(image).max(6).optional() });
export function requestError(issues: { path: PropertyKey[] }[], message?: unknown) {
  if (issues.some((issue) => issue.path[0] === "message") && typeof message === "string") return promptError(message) ?? "Invalid message.";
  if (issues.some((issue) => issue.path[0] === "images")) return "Attachments could not be accepted. Use up to six images (PNG/JPEG/WebP/GIF) or documents (PDF, TXT, MD, CSV, JSON) under 10 MB each.";
  return "This request could not be accepted. Reopen the task and try again.";
}