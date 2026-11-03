import { describe, expect, it } from "vitest";
import { aggregateModelStats, decisiveShare, formatDuration } from "@/lib/model-stats";

const run = (over: Partial<Parameters<typeof aggregateModelStats>[0][number]>) => ({
  provider: "openrouter", model: "gpt-6-astra", outcome: "completed", stage: "code",
  metrics: { totalMs: 10000, timeToFirstTokenMs: 800, steps: 3, usage: { input: 100, output: 50 } },
  startedAt: "2026-11-01T10:00:00Z", ...over,
});

describe("aggregateModelStats", () => {
  it("counts a cancelled run as neither success nor failure", () => {
    const stats = aggregateModelStats([
      run({ outcome: "completed" }),
      run({ outcome: "failed" }),
      run({ outcome: "cancelled" }),
      run({ outcome: "awaiting_approval" }),
      run({ outcome: null }),
    ]);
    expect(stats.length).toBe(1);
    const s = stats[0];
    expect(s.runs).toBe(5);
    expect(s.completed).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.undecided).toBe(2);
    expect(s.successRate).toBe(50);
  });

  it("reports no success rate when nothing reached a decisive outcome", () => {
    const stats = aggregateModelStats([run({ outcome: "cancelled" }), run({ outcome: null })]);
    expect(stats[0]?.successRate).toBeNull();
    expect(decisiveShare(stats[0]!)).toBe(0);
  });

  it("keeps models separate and averages only runs that recorded a number", () => {
    const stats = aggregateModelStats([
      run({ model: "a", metrics: { totalMs: 1000 } }),
      run({ model: "a", metrics: { totalMs: 3000 } }),
      run({ model: "a", metrics: null }),
      run({ model: "b", provider: "groq", metrics: { totalMs: 500 } }),
    ]);
    expect(stats.map((s) => s.model)).toEqual(["a", "b"]);
    expect(stats[0]?.avgTotalMs).toBe(2000);
    expect(stats[0]?.avgFirstTokenMs).toBeNull();
    expect(stats[0]?.avgSteps).toBeNull();
  });

  it("sums tokens and QA outcomes across a model's runs", () => {
    const stats = aggregateModelStats([
      run({ metrics: { usage: { input: 100, output: 40 }, qaPassed: true } }),
      run({ metrics: { usage: { input: 200, output: 60 }, qaPassed: false } }),
      run({ metrics: { usage: { input: 50, output: 10 } } }),
    ]);
    expect(stats[0]?.inputTokens).toBe(350);
    expect(stats[0]?.outputTokens).toBe(110);
    expect(stats[0]?.qaRuns).toBe(2);
    expect(stats[0]?.qaPassed).toBe(1);
  });
});

describe("formatDuration", () => {
  it("reads naturally at every scale", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(900)).toBe("900ms");
    expect(formatDuration(9400)).toBe("9.4s");
    expect(formatDuration(95_000)).toBe("1m 35s");
  });
});
