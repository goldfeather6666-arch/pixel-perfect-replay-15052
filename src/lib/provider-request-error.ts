export function modelConfigurationError(baseUrl: string | null, model: string): string | null {
  let host: string;
  try { host = new URL(baseUrl ?? "").hostname; } catch { return null; }
  if (host === "api.inceptionlabs.ai" && /^mercury\s+\d/i.test(model)) {
    return `Inception model IDs use hyphens, not spaces. This task selected “${model}”; select the exact model ID (for example mercury-3) in the task settings and resend. Your prompt size is not the issue.`;
  }
  return null;
}
export function providerRequestError(error: unknown): string {
  const e = error as { statusCode?: number; message?: string };
  if (e?.statusCode === 400 || /^bad request$/i.test(e?.message ?? "")) {
    return "The AI provider rejected the model request (400), after Forge accepted your prompt. Check the exact model ID, custom request options, and whether the model supports tools and this context size. No work completed; your prompt remains in the conversation.";
  }
  return "The agent request failed. Check the provider connection and try again after resolving the issue.";
}