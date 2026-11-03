// Cost labels for models listed from an owner's own API key. Forge never bills for model calls,
// so a model is only called free when the provider's own listing prices it at zero, it is served
// from hardware the owner runs, or the provider publishes a no-card free tier for it. Anything
// else stays "unknown" instead of being guessed as free.

export type ModelCost = "free" | "free-tier" | "paid" | "unknown";

/** USD per 1M tokens. */
export type ModelPrice = { input: number; output: number };

export type ModelOption = {
  id: string;
  cost: ModelCost;
  label: string;
  note: string;
  price: ModelPrice | null;
};

export const COST_META: Record<ModelCost, { label: string; note: string }> = {
  free: { label: "Free", note: "No per-token charge from the provider." },
  "free-tier": { label: "Free tier", note: "Usable at no cost inside the provider's free quota; daily limits apply." },
  paid: { label: "Paid", note: "The provider charges per token for this model." },
  unknown: { label: "Cost unknown", note: "This provider doesn't publish a price here — check before long runs." },
};

/** OpenRouter's explicitly free variants, e.g. `meta-llama/llama-3.3-70b:free`. */
const FREE_ID = /:free$/i;
/** Endpoints that are the owner's own machine or server rather than a metered API vendor. */
const SELF_HOSTED = /(ollama|localhost|127\.0\.0\.1|0\.0\.0\.0|::1|host\.docker\.internal|192\.168\.|10\.0\.|:11434|:1234)/i;
const GEMMA = /gemma/i;
const GEMINI_FREE_TIER = /(flash-lite|flash|embedding|aqa|tts|live)/i;
const GEMINI_PAID = /(pro|deep-research|imagen|veo)/i;

const number = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

const perMillion = (v: number) => Number(v.toFixed(6));

/** First stated key wins; bracket reads keep the strict index-signature rule happy. */
const field = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

/**
 * Reads a price block from a provider's model listing. `prompt`/`completion` are per token
 * (OpenRouter's shape); `input`/`output` are already per 1M tokens. Returns null when the
 * listing says nothing about price, so the caller can label the model "Cost unknown".
 */
export function parseModelPrice(raw: unknown): ModelPrice | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const prompt = number(field(o, "prompt", "prompt_tokens"));
  const completion = number(field(o, "completion", "completion_tokens"));
  if (prompt != null && completion != null) return { input: perMillion(prompt * 1e6), output: perMillion(completion * 1e6) };
  const input = number(field(o, "input", "input_price", "price_input"));
  const output = number(field(o, "output", "output_price", "price_output"));
  if (input != null && output != null) return { input: perMillion(input), output: perMillion(output) };
  return null;
}

/** Classifies one model. `price` is what the provider's own listing reported, if anything. */
export function modelCost(provider: string, id: string, price?: ModelPrice | null, baseUrl: string | null = null): ModelCost {
  if (FREE_ID.test(id)) return "free";
  if (price) return price.input === 0 && price.output === 0 ? "free" : "paid";
  if (provider === "compatible" && baseUrl && SELF_HOSTED.test(baseUrl)) return "free";
  if (provider === "google") {
    if (GEMMA.test(id)) return "free";
    if (GEMINI_FREE_TIER.test(id)) return "free-tier";
    if (GEMINI_PAID.test(id)) return "paid";
    return "unknown";
  }
  if (provider === "openai" || provider === "anthropic") return "paid";
  return "unknown";
}

/** Full pickable row: id plus the cost wording shown beside it. */
export function modelOption(provider: string, id: string, price?: ModelPrice | null, baseUrl: string | null = null): ModelOption {
  const cost = modelCost(provider, id, price, baseUrl);
  const meta = COST_META[cost];
  let note = meta.note;
  if (cost === "free" && provider === "compatible" && !price && baseUrl && SELF_HOSTED.test(baseUrl)) {
    note = "Runs on your own server — no per-token charge.";
  } else if (cost === "free" && provider === "google") {
    note = "Open model Google serves at no cost.";
  } else if (cost === "free-tier" && provider === "google") {
    note = "Covered by Google's free tier — no card needed, daily limits apply.";
  } else if (cost === "paid" && price) {
    note = `${priceUsdText(price)} per 1M tokens.`;
  }
  return { id, cost, label: meta.label, note, price: price ?? null };
}

export function isFreeCost(cost: ModelCost): boolean {
  return cost === "free" || cost === "free-tier";
}

/** "6 free · 3 free tier · 20 paid" — zero buckets are left out. */
export function costSummary(models: ModelOption[]): string {
  const counts: Record<ModelCost, number> = { free: 0, "free-tier": 0, paid: 0, unknown: 0 };
  for (const m of models) counts[m.cost] += 1;
  return (["free", "free-tier", "paid", "unknown"] as ModelCost[])
    .filter((c) => counts[c] > 0)
    .map((c) => `${counts[c]} ${COST_META[c].label.toLowerCase()}`)
    .join(" · ");
}

export function freeCount(models: ModelOption[]): number {
  return models.filter((m) => isFreeCost(m.cost)).length;
}

/** "$0.40 / $1.60" — input / output per 1M tokens, or null when the price is unpublished. */
export function priceUsdText(price: ModelPrice | null): string | null {
  if (!price) return null;
  return `$${price.input.toFixed(2)} / $${price.output.toFixed(2)}`;
}
