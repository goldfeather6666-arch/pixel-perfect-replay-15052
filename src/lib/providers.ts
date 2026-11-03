export type ProviderId = "openai" | "anthropic" | "google" | "openrouter" | "compatible" | "github" | "supabase" | "vercel";
export const SERVICE_IDS = ["github", "supabase", "vercel"] as const;
export const isAiProvider = (id: string) => !(SERVICE_IDS as readonly string[]).includes(id);

export const AI_PROVIDERS: { id: Exclude<ProviderId, "github" | "supabase" | "vercel">; name: string; needsBaseUrl?: boolean; hint: string }[] = [
  { id: "openai", name: "OpenAI", hint: "sk-..." },
  { id: "anthropic", name: "Anthropic", hint: "sk-ant-..." },
  { id: "google", name: "Google Gemini", hint: "AIza..." },
  { id: "openrouter", name: "OpenRouter", hint: "sk-or-..." },
  { id: "compatible", name: "Custom endpoint (OpenAI-compatible, Ollama, Inception…)", needsBaseUrl: true, hint: "Key (any value for Ollama)" },
];

export function providerName(id: string) {
  if (id === "github") return "GitHub";
  if (id === "supabase") return "Supabase";
  if (id === "vercel") return "Vercel";
  return AI_PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

export type Credential = {
  id: string;
  provider: ProviderId;
  label: string;
  base_url: string | null;
  last4: string;
  created_at: string;
  custom_models?: string[] | null;
  extra_body?: Record<string, string | number | boolean | null> | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolLog = { id: string; name: string; input: any; ok?: boolean | undefined; summary?: string | undefined };
export type ChatMessage = { role: "user" | "assistant"; content: string; tools?: ToolLog[] | undefined };
export type PendingChange = { path: string; action: "write" | "delete"; content?: string | undefined; original?: string | null | undefined };

export type AgentEvent =
  | { t: "text"; d: string }
  | { t: "tool"; id: string; name: string; input: unknown }
  | { t: "tool-result"; id: string; ok: boolean; summary: string }
  | { t: "progress"; id: string; summary: string }
  | { t: "pending"; pending: PendingChange[] }
  | { t: "usage"; input: number; output: number }
  | { t: "error"; m: string }
  /** Transient status (model queued/thinking); null clears it. Never counts as progress. */
  | { t: "wait"; d: string | null }
  | { t: "stage"; stage: string; runId: string | null }
  | { t: "done" };
