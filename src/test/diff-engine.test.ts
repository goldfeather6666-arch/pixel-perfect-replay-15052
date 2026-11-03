import { describe, expect, it } from "vitest";
import {
  applyHunks,
  createCheckpoint,
  diffAgainstCheckpoint,
  diffFile,
  diffLines,
  groupByIntent,
  hunksFromDiff,
  parseUnifiedDiff,
  revertToCheckpoint,
  summarizeDiff,
} from "../lib/diff-engine";

const DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@ function main
 line1
-old
+new
 line3
 line4
+line5
@@ -10,3 +10,2 @@ function other
 ctx
-gone
 ctx2
diff --git a/src/util/helper.ts b/src/util/helper.ts
--- /dev/null
+++ b/src/util/helper.ts
@@ -0,0 +1,2 @@
+export const a = 1;
+export const b = 2;
`;

describe("parseUnifiedDiff", () => {
  it("parses multiple files with hunks and counts", () => {
    const files = parseUnifiedDiff(DIFF);
    expect(files).toHaveLength(2);
    const app = files[0]!;
    expect(app.newPath).toBe("src/app.ts");
    expect(app.hunks).toHaveLength(2);
    expect(app.additions).toBe(2);
    expect(app.deletions).toBe(2);
    expect(app.hunks[0]!.header).toBe("function main");
    const helper = files[1]!;
    expect(helper.isNew).toBe(true);
    expect(helper.newPath).toBe("src/util/helper.ts");
    expect(helper.additions).toBe(2);
  });

  it("detects deletions and renames", () => {
    const del = parseUnifiedDiff(`--- a/old.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-x\n`);
    expect(del[0]!.isDeleted).toBe(true);
    expect(del[0]!.oldPath).toBe("old.ts");
    const ren = parseUnifiedDiff(`--- a/a.ts\n+++ b/b.ts\n@@ -1,1 +1,1 @@\n-x\n+y\n`);
    expect(ren[0]!.isRename).toBe(true);
    expect(ren[0]!.newPath).toBe("b.ts");
  });
});

describe("applyHunks", () => {
  const original = "line1\nold\nline3\nline4\na\nb\nc\nd\ne\nctx\ngone\nctx2";

  it("applies all hunks when all chosen", () => {
    const [app] = parseUnifiedDiff(DIFF) as [import("../lib/diff-engine").FileDiff];
    const out = applyHunks(original, app, [0, 1]);
    expect(out).toContain("new");
    expect(out).toContain("line5");
    expect(out).not.toContain("gone");
    expect(out).not.toContain("\nold\n");
  });

  it("applies only the chosen hunk subset", () => {
    const [app] = parseUnifiedDiff(DIFF) as [import("../lib/diff-engine").FileDiff];
    const out = applyHunks(original, app, [1]);
    expect(out).toContain("\nold\n"); // hunk 0 rejected
    expect(out).not.toContain("gone"); // hunk 1 accepted
  });

  it("skips hunks that no longer match instead of corrupting the file", () => {
    const [app] = parseUnifiedDiff(DIFF) as [import("../lib/diff-engine").FileDiff];
    const out = applyHunks("totally\ndifferent\ncontent", app, [0, 1]);
    expect(out).toBe("totally\ndifferent\ncontent");
  });
});

describe("groupByIntent", () => {
  it("groups by top-level area, sorted by change size", () => {
    const files = parseUnifiedDiff(DIFF);
    const groups = groupByIntent(files);
    const intents = groups.map((g) => g.intent);
    expect(intents).toContain("src");
    expect(intents).toContain("src/util");
    expect(intents[0]).toBe("src"); // app.ts has 4 changed lines vs util's 2
    const util = groups.find((g) => g.intent === "src/util")!;
    expect(util.additions).toBe(2);
  });
});

describe("summarizeDiff", () => {
  it("produces per-file what/where lines", () => {
    const lines = summarizeDiff(parseUnifiedDiff(DIFF));
    expect(lines[0]).toMatch(/^Modified: src\/app\.ts \(\+2\/-2\) — touches function main/);
    expect(lines[1]).toMatch(/^New file: src\/util\/helper\.ts \(\+2\/-0\)/);
  });
});

describe("checkpoints", () => {
  it("snapshots and restores files", () => {
    const cp = createCheckpoint({ "a.ts": "one", "b.ts": "two" }, "before edit");
    expect(cp.label).toBe("before edit");
    const restored = revertToCheckpoint(cp);
    expect(restored).toEqual({ "a.ts": "one", "b.ts": "two" });
  });

  it("reports changed, added and removed paths against a checkpoint", () => {
    const cp = createCheckpoint({ "a.ts": "one", "b.ts": "two" });
    const diff = diffAgainstCheckpoint(cp, { "a.ts": "one!", "c.ts": "three" });
    expect(diff.changed).toEqual(["a.ts"]);
    expect(diff.added).toEqual(["c.ts"]);
    expect(diff.removed).toEqual(["b.ts"]);
  });
});

describe("diffLines + hunksFromDiff", () => {
  const before = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl";
  const after = "a\nB\nc\nd\ne\nf\ng\nh\nI\nj\nk\nl\nm";

  it("produces separate hunks for distant changes", () => {
    const hunks = diffFile(before, after);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.oldStart).toBe(1);
    expect(hunks[1]!.lines.some((l) => l.text === "m" && l.kind === "add")).toBe(true);
  });

  it("applying all hunks reproduces the new content exactly", () => {
    const hunks = diffFile(before, after);
    const out = applyHunks(before, { hunks }, hunks.map((h) => h.index));
    expect(out).toBe(after);
  });

  it("applying a subset keeps the rest of the original", () => {
    const hunks = diffFile(before, after);
    const out = applyHunks(before, { hunks }, [0]);
    expect(out).toContain("\nB\n");
    expect(out).toContain("\ni\n"); // second change rejected
    expect(out.endsWith("\nl")).toBe(true); // trailing add rejected
  });

  it("returns no hunks for identical content", () => {
    expect(diffFile("same\nfile", "same\nfile")).toHaveLength(0);
  });

  it("handles create-from-empty and delete-to-empty", () => {
    const created = diffFile("", "x\ny");
    expect(applyHunks("", { hunks: created }, [0])).toBe("x\ny");
    const deleted = diffFile("x\ny", "");
    expect(applyHunks("x\ny", { hunks: deleted }, [0])).toBe("");
    expect(applyHunks("x\ny", { hunks: deleted }, [])).toBe("x\ny"); // reject keeps original
  });

  it("diffLines falls back to whole-file replace for huge inputs", () => {
    const big = Array.from({ length: 2100 }, (_, i) => `line${i}`).join("\n");
    const lines = diffLines(big, big + "\nextra");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("hunksFromDiff merges nearby changes into one hunk", () => {
    const hunks = hunksFromDiff(diffLines("a\nb\nc", "A\nb\nC"), 3);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.oldLines).toBe(3);
    expect(hunks[0]!.newLines).toBe(3);
  });
});
