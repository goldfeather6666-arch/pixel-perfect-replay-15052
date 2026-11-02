import { describe, expect, it } from "vitest";
import { activeMention, insertMention, mentionPathOk, parseMentions } from "@/lib/mentions";

describe("chat @-mentions", () => {
  it("parses files, skills and MCP tools", () => {
    expect(parseMentions("Fix @file:src/App.tsx using @skill:frontend-design, and @mcp:github")).toEqual({ file: ["src/App.tsx"], skill: ["frontend-design"], mcp: ["github"] });
  });
  it("ignores emails", () => {
    expect(parseMentions("mail a@skill:x.com").skill).toEqual([]);
  });
  it("detects the token being typed and inserts a choice", () => {
    const t = "use @sk";
    expect(activeMention(t, t.length)).toEqual({ start: 4, kind: null, query: "sk" });
    const a = activeMention("x @skill:fro", 12)!;
    expect(a.kind).toBe("skill");
    expect(insertMention("x @skill:fro", a, 12, "skill", "frontend").text).toBe("x @skill:frontend ");
  });
  it("rejects path traversal", () => {
    expect(mentionPathOk("../etc/passwd")).toBe(false);
    expect(mentionPathOk("src/a.ts")).toBe(true);
  });
});
