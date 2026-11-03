import { describe, expect, it } from "vitest";
import { applyEdits, compactMessages, autoContinueSegments } from "@/lib/engine/long-session";

describe("long-session", () => {
  it("applies a unique find/replace edit", () => {
    const r = applyEdits("a\nb\nc", [{ find: "b", replace: "B" }]);
    expect(r).toEqual({ ok: true, content: "a\nB\nc", replaced: 1 });
  });
  it("rejects ambiguous and missing edits", () => {
    expect(applyEdits("x x", [{ find: "x", replace: "y" }]).ok).toBe(false);
    expect(applyEdits("x", [{ find: "z", replace: "y" }]).ok).toBe(false);
    expect(applyEdits("x x", [{ find: "x", replace: "y", all: true }])).toMatchObject({ content: "y y", replaced: 2 });
  });
  it("compacts only older large tool results", () => {
    const big = "z".repeat(5000);
    const msgs = Array.from({ length: 10 }, () => ({ role: "tool", content: [{ type: "tool-result", toolName: "read_file", output: { type: "text", value: big } }] }));
    const r = compactMessages(msgs, 8, 1500);
    expect(r.compacted).toBe(2);
    expect(JSON.stringify(r.messages[9])).toContain(big);
  });
  it("gives large builds 10 continuation segments", () => {
    expect(autoContinueSegments("large")).toBe(10);
    expect(autoContinueSegments("small")).toBe(2);
  });
});
