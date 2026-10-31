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

import { isRisky, parseCommandReply } from "@/lib/terminal";
describe("AI command helper", () => {
  it("reads JSON replies, even fenced", () => {
    expect(parseCommandReply('```json\n{"command":"npm test","explanation":"Runs tests"}\n```')).toEqual({ command: "npm test", explanation: "Runs tests" });
  });
  it("falls back to a bare command line", () => {
    expect(parseCommandReply("$ git status").command).toBe("git status");
  });
  it("never auto-runs destructive commands", () => {
    expect(isRisky("rm -rf node_modules")).toBe(true);
    expect(isRisky("git push origin main")).toBe(true);
    expect(isRisky("ls -la")).toBe(false);
  });
});

import { looksLikeRequest } from "@/lib/terminal";
describe("plain-language detection", () => {
  it("sends English requests to the AI", () => {
    expect(looksLikeRequest("install dependencies and build")).toBe(true);
    expect(looksLikeRequest("type dependencies and build")).toBe(true);
  });
  it("runs real commands directly", () => {
    expect(looksLikeRequest("npm test")).toBe(false);
    expect(looksLikeRequest("git status")).toBe(false);
    expect(looksLikeRequest("ls -la src")).toBe(false);
  });
});
