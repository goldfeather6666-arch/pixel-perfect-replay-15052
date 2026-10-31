import { describe, expect, it } from "vitest";
import { parseWorkSplit, workSplitPrompt } from "@/lib/work-split";

const plan = (items: unknown[]) => JSON.stringify({ summary: "s", items });

describe("work split", () => {
  it("puts exactly one master first", () => {
    const p = parseWorkSplit(plan([
      { role: "coder", title: "A", paths: ["a.ts"] },
      { role: "master", title: "M" },
      { role: "master", title: "M2" },
    ]));
    expect(p.items.map((i) => i.role)).toEqual(["master", "coder"]);
  });
  it("adds a master when the model omits one", () => {
    expect(parseWorkSplit(plan([{ role: "tester", title: "T" }])).items[0]!.role).toBe("master");
  });
  it("never gives the same file to two coders", () => {
    const p = parseWorkSplit(plan([
      { role: "master", title: "M" },
      { role: "coder", title: "A", paths: ["x.ts"] },
      { role: "coder", title: "B", paths: ["x.ts", "y.ts"] },
    ]));
    expect(p.items[2]!.paths).toEqual(["y.ts"]);
  });
  it("drops invalid dependencies", () => {
    const p = parseWorkSplit(plan([{ role: "master", title: "M" }, { role: "tester", title: "T", dependsOn: [2, 9, 1] }]));
    expect(p.items[1]!.dependsOn).toEqual([1]);
  });
  it("reads JSON wrapped in prose and rejects missing plans", () => {
    expect(parseWorkSplit("Here:\n```json\n" + plan([{ role: "master", title: "M" }]) + "\n```").items).toHaveLength(1);
    expect(() => parseWorkSplit("no plan")).toThrow();
  });
  it("builds a master prompt with roles and order", () => {
    const text = workSplitPrompt("Do X", parseWorkSplit(plan([{ role: "master", title: "M" }, { role: "coder", title: "C", dependsOn: [1], paths: ["a.ts"] }])));
    expect(text).toContain("2. [coder] C (after 1)");
    expect(text).toContain("Files: a.ts");
  });
});
