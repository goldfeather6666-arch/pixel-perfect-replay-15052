// Capability registry for models. Values are conservative published figures; unknown models get
// safe defaults and are flagged so the UI never claims a capability we have not confirmed.
export type ModelCaps = {
  known: boolean;
  contextWindow: number;
  maxOutput: number;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  /** USD per 1M tokens, null when unknown */
  inputPrice: number | null;
  outputPrice: number | null;
};

const TABLE: [RegExp, Omit<ModelCaps, "known">][] = [
  [/claude.*(opus)/i, { contextWindow: 200_000, maxOutput: 32_000, tools: true, vision: true, reasoning: true, inputPrice: 15, outputPrice: 75 }],
  [/claude.*(sonnet)/i, { contextWindow: 200_000, maxOutput: 64_000, tools: true, vision: true, reasoning: true, inputPrice: 3, outputPrice: 15 }],
  [/claude.*(haiku)/i, { contextWindow: 200_000, maxOutput: 8_192, tools: true, vision: true, reasoning: false, inputPrice: 0.8, outputPrice: 4 }],
  [/gpt-5.*(mini)/i, { contextWindow: 400_000, maxOutput: 128_000, tools: true, vision: true, reasoning: true, inputPrice: 0.25, outputPrice: 2 }],
  [/gpt-5.*(nano)/i, { contextWindow: 400_000, maxOutput: 128_000, tools: true, vision: true, reasoning: true, inputPrice: 0.05, outputPrice: 0.4 }],
  [/gpt-5/i, { contextWindow: 400_000, maxOutput: 128_000, tools: true, vision: true, reasoning: true, inputPrice: 1.25, outputPrice: 10 }],
  [/gpt-4\.1/i, { contextWindow: 1_000_000, maxOutput: 32_768, tools: true, vision: true, reasoning: false, inputPrice: 2, outputPrice: 8 }],
  [/gpt-4o-mini/i, { contextWindow: 128_000, maxOutput: 16_384, tools: true, vision: true, reasoning: false, inputPrice: 0.15, outputPrice: 0.6 }],
  [/gpt-4o/i, { contextWindow: 128_000, maxOutput: 16_384, tools: true, vision: true, reasoning: false, inputPrice: 2.5, outputPrice: 10 }],
  [/\bo[34](-mini)?\b/i, { contextWindow: 200_000, maxOutput: 100_000, tools: true, vision: true, reasoning: true, inputPrice: 1.1, outputPrice: 4.4 }],
  [/gemini.*pro/i, { contextWindow: 1_000_000, maxOutput: 65_536, tools: true, vision: true, reasoning: true, inputPrice: 1.25, outputPrice: 10 }],
  [/gemini.*flash-lite/i, { contextWindow: 1_000_000, maxOutput: 65_536, tools: true, vision: true, reasoning: false, inputPrice: 0.1, outputPrice: 0.4 }],
  [/gemini.*flash/i, { contextWindow: 1_000_000, maxOutput: 65_536, tools: true, vision: true, reasoning: true, inputPrice: 0.3, outputPrice: 2.5 }],
  [/deepseek.*(reasoner|r1)/i, { contextWindow: 128_000, maxOutput: 32_000, tools: true, vision: false, reasoning: true, inputPrice: 0.55, outputPrice: 2.19 }],
  [/deepseek/i, { contextWindow: 128_000, maxOutput: 8_000, tools: true, vision: false, reasoning: false, inputPrice: 0.27, outputPrice: 1.1 }],
  [/glm-5/i, { contextWindow: 1_000_000, maxOutput: 32_000, tools: true, vision: false, reasoning: true, inputPrice: null, outputPrice: null }],
  [/mercury/i, { contextWindow: 128_000, maxOutput: 16_000, tools: true, vision: false, reasoning: false, inputPrice: null, outputPrice: null }],
  [/qwen.*coder|kimi|llama/i, { contextWindow: 128_000, maxOutput: 16_000, tools: true, vision: false, reasoning: false, inputPrice: null, outputPrice: null }],
];

const UNKNOWN: Omit<ModelCaps, "known"> = { contextWindow: 64_000, maxOutput: 8_000, tools: true, vision: false, reasoning: false, inputPrice: null, outputPrice: null };

export function modelCaps(modelId: string): ModelCaps {
  const id = modelId.split("/").pop() ?? modelId;
  for (const [re, caps] of TABLE) if (re.test(id)) return { known: true, ...caps };
  return { known: false, ...UNKNOWN };
}

/** Rough token estimate (≈4 chars/token) — used for budgeting, never for billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function costUsd(caps: ModelCaps, usage: { input: number; output: number }): number | null {
  if (caps.inputPrice == null || caps.outputPrice == null) return null;
  return Math.round(((usage.input * caps.inputPrice + usage.output * caps.outputPrice) / 1_000_000) * 10_000) / 10_000;
}

/**
 * Keep the newest messages that fit the model's input budget (window minus reserved output and
 * the fixed system/tool overhead). Always keeps the latest message.
 */
export function fitToBudget<T>(items: T[], size: (item: T) => number, caps: ModelCaps, overhead: number): { kept: T[]; dropped: number } {
  const budget = Math.max(4_000, caps.contextWindow - Math.min(caps.maxOutput, 16_000) - overhead);
  const kept: T[] = [];
  let used = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as T;
    const n = size(item);
    if (kept.length && used + n > budget) break;
    kept.unshift(item);
    used += n;
  }
  return { kept, dropped: items.length - kept.length };
}
