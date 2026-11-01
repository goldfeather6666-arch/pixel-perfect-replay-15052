import { describe, expect, it } from "vitest";
import { agentLiveness, NO_PROGRESS_MS } from "@/lib/agent-liveness";

describe("agent liveness", () => {
  it("detects silence rather than a healthy long-running task", () => {
    const life = agentLiveness(0);
    life.progress(NO_PROGRESS_MS - 1);
    expect(life.stalled(NO_PROGRESS_MS)).toBe(false);
  });
  it("declares no signs of life at exactly two minutes of silence", () => {
    const life = agentLiveness(0);
    expect(NO_PROGRESS_MS).toBe(120_000);
    expect(life.stalled(119_999)).toBe(false);
    expect(life.stalled(120_000)).toBe(true);
  });
});