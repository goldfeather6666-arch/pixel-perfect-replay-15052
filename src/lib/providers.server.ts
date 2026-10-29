import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

function trimSlash(u: string) {
  return u.replace(/\/+$/, "");
}

export function createModel(provider: string, apiKey: string, baseUrl: string | null, modelId: string) {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "openrouter":
      return createOpenAICompatible({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey })(modelId);
    case "compatible":
      if (!baseUrl) throw new Error("Base URL required");
      return createOpenAICompatible({ name: "custom", baseURL: trimSlash(baseUrl), apiKey })(modelId);
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

/** Lists models; doubles as credential validation. */
export async function listProviderModels(provider: string, apiKey: string, baseUrl: string | null): Promise<string[]> {
  let ids: string[] = [];
  if (provider === "openai") {
    const j = await getJson("https://api.openai.com/v1/models", { Authorization: `Bearer ${apiKey}` });
    ids = j.data.map((m: { id: string }) => m.id).filter((id: string) => /^(gpt|o\d|chatgpt|codex)/.test(id));
  } else if (provider === "anthropic") {
    const j = await getJson("https://api.anthropic.com/v1/models?limit=100", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    ids = j.data.map((m: { id: string }) => m.id);
  } else if (provider === "google") {
    const j = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`, {});
    ids = j.models
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""));
  } else if (provider === "openrouter") {
    await getJson("https://openrouter.ai/api/v1/key", { Authorization: `Bearer ${apiKey}` });
    const j = await getJson("https://openrouter.ai/api/v1/models", {});
    ids = j.data.map((m: { id: string }) => m.id);
  } else if (provider === "compatible") {
    if (!baseUrl) throw new Error("Base URL required");
    const j = await getJson(`${trimSlash(baseUrl)}/models`, { Authorization: `Bearer ${apiKey}` });
    ids = (j.data ?? j.models ?? []).map((m: { id?: string; name?: string }) => m.id ?? m.name);
  } else {
    throw new Error("Unknown provider");
  }
  return ids.sort();
}
