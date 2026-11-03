import { describe, expect, it } from "vitest";
import { costSummary, freeCount, isFreeCost, modelCost, modelOption, parseModelPrice } from "@/lib/model-pricing";

describe("model cost labels", () => {
  it("labels a zero-priced OpenRouter listing and its :free variants as free", () => {
    expect(parseModelPrice({ prompt: "0", completion: "0" })).toEqual({ input: 0, output: 0 });
    expect(modelCost("openrouter", "meta-llama/llama-3.3-70b", { input: 0, output: 0 })).toBe("free");
    expect(modelCost("openrouter", "deepseek/deepseek-r1:free", null)).toBe("free");
  });

  it("converts OpenRouter's per-token price into USD per 1M tokens", () => {
    expect(parseModelPrice({ prompt: "0.0000005", completion: "0.0000015" })).toEqual({ input: 0.5, output: 1.5 });
    expect(modelCost("openrouter", "anthropic/claude-sonnet-4.5", { input: 3, output: 15 })).toBe("paid");
  });

  it("keeps Google's free-tier models free and its pro models paid", () => {
    expect(modelCost("google", "gemini-3-flash")).toBe("free-tier");
    expect(modelCost("google", "gemini-3.1-flash-lite")).toBe("free-tier");
    expect(modelCost("google", "gemma-3-27b-it")).toBe("free");
    expect(modelCost("google", "gemini-3-pro")).toBe("paid");
    expect(modelCost("google", "some-brand-new-model")).toBe("unknown");
  });

  it("treats OpenAI and Anthropic keys as paid and an unpriced custom endpoint as unknown", () => {
    expect(modelCost("openai", "gpt-5.4-mini")).toBe("paid");
    expect(modelCost("anthropic", "claude-sonnet-4-5")).toBe("paid");
    expect(modelCost("compatible", "mercury-3", null, "https://api.inceptionlabs.ai/v1")).toBe("unknown");
  });

  it("calls models served from the owner's own server free", () => {
    expect(modelCost("compatible", "qwen2.5-coder:7b", null, "https://runner.example.com/ollama/v1")).toBe("free");
    expect(modelOption("compatible", "qwen2.5-coder:7b", null, "https://runner.example.com/ollama/v1").note)
      .toBe("Runs on your own server — no per-token charge.");
  });

  it("never invents a price when the listing is silent", () => {
    expect(parseModelPrice(undefined)).toBeNull();
    expect(parseModelPrice({ context_length: 128000 })).toBeNull();
    expect(modelOption("compatible", "mystery-model", null, "https://api.vendor.com/v1").label).toBe("Cost unknown");
  });

  it("summarises a key's models so the picker can state how many are free", () => {
    const models = [
      modelOption("google", "gemini-3-flash", null),
      modelOption("google", "gemini-3-pro", null),
      modelOption("openrouter", "qwen/qwen-2.5-7b:free", null),
      modelOption("compatible", "mercury-3", null, "https://api.inceptionlabs.ai/v1"),
    ];
    expect(costSummary(models)).toBe("2 free · 1 paid · 1 cost unknown");
    expect(freeCount(models)).toBe(2);
    expect(isFreeCost("free-tier")).toBe(true);
  });
});
