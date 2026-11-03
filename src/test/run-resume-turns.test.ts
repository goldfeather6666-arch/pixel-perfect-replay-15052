import { describe, expect, it } from "vitest";
import { recoveryTurns } from "@/lib/run-resume";

const history = [
  { role: "user" as const, content: "Build it" },
  { role: "assistant" as const, content: "Working on it\n\nNo signs of life detected. Progress saved; automatic recovery is queued.", tools: [{ id: "a" }] },
];

describe("silent automatic recovery", () => {
  it("adds no user message and continues the interrupted reply", () => {
    const t = recoveryTurns(history, true);
    expect(t.base).toHaveLength(1);
    const merged = t.assistant("Done.", [{ id: "b" }]);
    expect(merged.content).toBe("Working on it\n\nDone.");
    expect(merged.tools).toEqual([{ id: "a" }, { id: "b" }]);
  });
  it("keeps normal messages unchanged", () => {
    const t = recoveryTurns(history, false);
    expect(t.base).toHaveLength(2);
    expect(t.assistant("Hi", []).content).toBe("Hi");
  });
});
