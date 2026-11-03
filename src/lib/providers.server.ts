import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { planLimitFetch } from "./provider-limits";
import { googleQuotaFetch, isGoogleChatModel } from "./google-quota";
import { modelOption, parseModelPrice, type ModelOption, type ModelPrice } from "./model-pricing";

function trimSlash(u: string) {
  return u.replace(/\/+$/, "");
}

/** Fetch wrapper that merges extra JSON fields (e.g. reasoning_effort) into chat requests. */
export function mergeBodyFetch(extra: Record<string, unknown> | null | undefined): typeof fetch | undefined {
  if (!extra || Object.keys(extra).length === 0) return undefined;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init && typeof init.body === "string") {
      try {
        init = { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...extra }) };
      } catch { /* not JSON */ }
    }
    return fetch(input, init);
  }) as typeof fetch;
}

export function createModel(provider: string, apiKey: string, baseUrl: string | null, modelId: string, extraBody?: Record<string, unknown> | null) {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey, fetch: googleQuotaFetch() })(modelId);
    case "openrouter":
      return createOpenAICompatible({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey })(modelId);
    case "compatible":
      if (!baseUrl) throw new Error("Base URL required");
      return createOpenAICompatible({ name: "custom", baseURL: trimSlash(baseUrl), apiKey, fetch: planLimitFetch(`${trimSlash(baseUrl)}|${apiKey.slice(-6)}`, mergeBodyFetch(extraBody) ?? fetch) })(modelId);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`Provider responded ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Lists models with cost labels; doubles as credential validation. */
export async function listProviderModels(provider: string, apiKey: string, baseUrl: string | null, customModels: string[] = []): Promise<ModelOption[]> {
  let rows: { id: string; price: ModelPrice | null }[] = [];
  if (provider === "openai") {
    const j = await getJson("https://api.openai.com/v1/models", { Authorization: `Bearer ${apiKey}` });
    rows = j.data.map((m: { id: string }) => ({ id: m.id, price: null })).filter((r: { id: string }) => /^(gpt|o\d|chatgpt|codex)/.test(r.id));
  } else if (provider === "anthropic") {
    const j = await getJson("https://api.anthropic.com/v1/models?limit=100", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    rows = j.data.map((m: { id: string }) => ({ id: m.id, price: null }));
  } else if (provider === "google") {
    const j = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`, {});
    rows = j.models
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => ({ id: m.name.replace(/^models\//, ""), price: null }))
      .filter((r: { id: string }) => isGoogleChatModel(r.id));
  } else if (provider === "openrouter") {
    await getJson("https://openrouter.ai/api/v1/key", { Authorization: `Bearer ${apiKey}` });
    const j = await getJson("https://openrouter.ai/api/v1/models", {});
    rows = j.data.map((m: { id: string; pricing?: unknown }) => ({ id: m.id, price: parseModelPrice(m.pricing) }));
  } else if (provider === "compatible") {
    if (!baseUrl) throw new Error("Base URL required");
    await assertPublicEndpoint(baseUrl);
    try {
      const j = await getJson(`${trimSlash(baseUrl)}/models`, { Authorization: `Bearer ${apiKey}` });
      rows = (j.data ?? j.models ?? []).map((m: { id?: string; name?: string; pricing?: unknown; price?: unknown }) => ({ id: m.id ?? m.name, price: parseModelPrice(m.pricing ?? m.price) }));
    } catch (e) {
      if (customModels.length === 0) throw e;
    }
    // Hand-typed model IDs carry no price, so they stay "Cost unknown" rather than being guessed.
    const byId = new Map<string, { id: string; price: ModelPrice | null }>();
    for (const r of [...customModels.map((id) => ({ id, price: null })), ...rows]) if (r.id && !byId.has(r.id)) byId.set(r.id, r);
    rows = [...byId.values()];
  } else {
    throw new Error("Unknown provider");
  }
  return rows
    .filter((r) => r.id)
    .map((r) => modelOption(provider, r.id, r.price, baseUrl))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Sends a one-token chat request; used to verify endpoints without a /models list. */
export async function pingChat(baseUrl: string, apiKey: string, model: string, extra: Record<string, unknown> | null) {
  await assertPublicEndpoint(baseUrl);
  const res = await fetch(`${trimSlash(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }], ...(extra ?? {}) }),
  });
  if (!res.ok) throw new Error(`Endpoint responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Custom endpoints must be public HTTPS hosts so keys and requests can't be aimed at private networks. */
export async function assertPublicEndpoint(baseUrl: string) {
  const { verifyPublicTarget } = await import("./mcp-network.server");
  try { await verifyPublicTarget(baseUrl); } catch { throw new Error("Custom endpoint must be a public HTTPS address"); }
}
