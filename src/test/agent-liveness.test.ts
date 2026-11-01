import { describe, expect, it } from "vitest";
import { agentLiveness, NO_PROGRESS_MS } from "@/lib/agent-liveness";

describe("agent liveness", () => {
  it("detects silence rather than a healthy long-running task", () => {
    const life = agentLiveness(0);
    life.progress(NO_PROGRESS_MS - 1);
    expect(life.stalled(NO_PROGRESS_MS)).toBe(false);
  });
  it("declares no signs of life only after fifteen minutes of silence", () => {
    const life = agentLiveness(0);
    expect(life.stalled(NO_PROGRESS_MS - 1)).toBe(false);
    expect(life.stalled(NO_PROGRESS_MS)).toBe(true);
  });
});