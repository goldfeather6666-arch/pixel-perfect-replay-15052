import { describe, expect, it } from "vitest";
import { ownsScreenshot, screenshotError, visualFixPrompt, type VisualComparison } from "@/lib/visual-comparison";

describe("screenshot comparison safeguards", () => {
  it("restricts screenshot paths to the caller's task", () => {
    expect(ownsScreenshot("alice/task-a/image.png", "alice", "task-a")).toBe(true);
    expect(ownsScreenshot("bob/task-a/image.png", "alice", "task-a")).toBe(false);
    expect(ownsScreenshot("alice/task-b/image.png", "alice", "task-a")).toBe(false);
    expect(ownsScreenshot("alice/task-a/../image.png", "alice", "task-a")).toBe(false);
  });
  it("rejects empty, oversized and unsupported uploads", () => {
    expect(screenshotError({ type: "image/png", size: 1200 })).toBe(null);
    expect(screenshotError({ type: "image/png", size: 0 })).not.toBe(null);
    expect(screenshotError({ type: "image/png", size: 10_000_001 })).not.toBe(null);
    expect(screenshotError({ type: "image/svg+xml", size: 100 })).not.toBe(null);
  });
  it("sends only explicitly selected layout fixes", () => {
    const result: VisualComparison = { summary: "Two differences", viewportNotes: "Same viewport", differences: [
      { area: "Header", priority: "high", observed: "Too tall", expected: "Compact", fix: "Reduce header height", confidence: "high" },
      { area: "Footer", priority: "low", observed: "Wide", expected: "Narrow", fix: "Reduce footer width", confidence: "medium" },
    ] };
    expect(visualFixPrompt(result, [0])).toContain("Reduce header height");
    expect(visualFixPrompt(result, [0])).not.toContain("Reduce footer width");
    expect(visualFixPrompt(result, [])).toBe("");
  });
});