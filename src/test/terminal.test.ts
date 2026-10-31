import { describe, expect, it } from "vitest";
import { CWD_MARK, extractCwd, parseAnsi, wrapCommand } from "@/lib/terminal";

describe("terminal helpers", () => {
  it("runs in the tracked directory and keeps the exit code", () => {
    const w = wrapCommand("ls", "/repo/src");
    expect(w.startsWith("cd '/repo/src'")).toBe(true);
    expect(w).toContain("exit $__c");
  });
  it("extracts the new directory and hides the marker", () => {
    expect(extractCwd(`hello\n${CWD_MARK}/repo/app\n`)).toEqual({ out: "hello", cwd: "/repo/app" });
  });
  it("colors red text and resets", () => {
    const s = parseAnsi("\x1b[31merr\x1b[0m ok");
    expect(s[0]).toEqual({ text: "err", cls: "text-destructive" });
    expect(s[1]).toEqual({ text: " ok", cls: "" });
  });
});
