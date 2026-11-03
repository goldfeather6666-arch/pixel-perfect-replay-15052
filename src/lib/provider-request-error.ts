import { planLimitMessage } from "./provider-limits";
import { googleQuotaMessage } from "./google-quota";
export function modelConfigurationError(baseUrl: string | null, model: string): string | null {
  let host: string;
  try { host = new URL(baseUrl ?? "").hostname; } catch { return null; }
  if (host === "api.inceptionlabs.ai" && /^mercury\s+\d/i.test(model)) {
    return `Inception model IDs use hyphens, not spaces. This task selected “${model}”; select the exact model ID (for example mercury-3) in the task settings and resend. Your prompt size is not the issue.`;
  }
  return null;
}

/** Provider throttling (429 / output-token caps) is recoverable by waiting; other failures are not. */
export function isRateLimit(error: unknown): boolean {
  const e = error as { statusCode?: number; message?: string };
  return e?.statusCode === 429 || /rate.?limit|too many requests|output token limit|token limit|insufficient_quota/i.test(String(e?.message ?? ""));
}

export function providerRequestError(error: unknown): string {
  const e = error as { statusCode?: number; message?: string };
  if (e?.statusCode === 400 || /^bad request$/i.test(e?.message ?? "")) {
    return "The AI provider rejected the model request (400), after Forge accepted your prompt. Check the exact model ID, custom request options, and whether the model supports tools and this context size. No work completed; your prompt remains in the conversation.";
  }
  const gq = googleQuotaMessage(String(e?.message ?? ""));
  if (gq) return gq;
  const pl = planLimitMessage(String(e?.message ?? ""));
  if (pl) return pl;
  if (isRateLimit(e)) {
    return "The AI provider's rate limit was reached (usually a cap on generated tokens per minute). Everything done so far is saved — wait a few minutes and send “continue”.";
  }
  if (e?.statusCode === 401 || e?.statusCode === 403) {
    const reason = String(e?.message ?? "").replace(/\s+/g, " ").replace(/(sk|key)[-_][A-Za-z0-9_-]{8,}/gi, "[key]").slice(0, 240);
    return `The AI provider refused this API key (${e.statusCode})${reason ? `: “${reason}”` : ""}. Update or replace the key in Settings, or switch this task to another key with the model picker, then resend.`;
  }
  return "The agent request failed. Check the provider connection and try again after resolving the issue.";
}
