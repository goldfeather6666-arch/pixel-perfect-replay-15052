import { describe, expect, it } from "vitest";
import { agentLiveness, MODEL_FIRST_RESPONSE_MS, NO_PROGRESS_MS } from "@/lib/agent-liveness";

describe("agent liveness", () => {
  it("detects silence rather than a healthy long-running task", () => {
    const life = agentLiveness(0);
    life.progress(NO_PROGRESS_MS - 1);
    expect(life.stalled(NO_PROGRESS_MS)).toBe(false);
  });
  it("declares no signs of life at exactly one minute of silence", () => {
    const life = agentLiveness(0);
    expect(NO_PROGRESS_MS).toBe(60_000);
    expect(life.stalled(59_999)).toBe(false);
    expect(life.stalled(60_000)).toBe(true);
  });
  it("gives a slow model four minutes to send its first byte", () => {
    const life = agentLiveness(0);
    life.awaitModel(0);
    expect(MODEL_FIRST_RESPONSE_MS).toBe(240_000);
    expect(life.stalled(239_999)).toBe(false);
    expect(life.stalled(240_000)).toBe(true);
  });
  it("returns to the two-minute silence rule once the model replies", () => {
    const life = agentLiveness(0);
    life.awaitModel(0);
    life.progress(10_000);
    expect(life.awaitingSince()).toBeNull();
    expect(life.stalled(130_000)).toBe(true);
  });
});