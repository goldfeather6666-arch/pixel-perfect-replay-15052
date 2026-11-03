// Pure diff engine: parse unified diffs, group hunks by intent, apply a chosen
// subset of hunks, and snapshot/restore file checkpoints. No I/O — usable from
// the sandbox agent, server functions, and the review UI alike.

export type DiffLine = { kind: "context" | "add" | "del"; text: string };

export type Hunk = {
  index: number; // position within the file's hunk list
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string; // text after @@ ... @@ (often the enclosing symbol)
  lines: DiffLine[];
};

export type FileDiff = {
  oldPath: string;
  newPath: string;
  isNew: boolean;
  isDeleted: boolean;
  isRename: boolean;
  hunks: Hunk[];
  additions: number;
  deletions: number;
};

const stripPrefix = (p: string) => p.replace(/^[ab]\//, "");

/** Parse a unified diff (one or many files) into structured FileDiffs. */
export function parseUnifiedDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let cur: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let seenOld = "";
  let seenNew = "";
  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      cur = null; hunk = null; seenOld = ""; seenNew = "";
      continue;
    }
    if (raw.startsWith("--- ")) {
      seenOld = raw.slice(4).trim();
      if (seenOld === "/dev/null") {
        cur = { oldPath: "", newPath: "", isNew: true, isDeleted: false, isRename: false, hunks: [], additions: 0, deletions: 0 };
        files.push(cur);
      }
      continue;
    }
    if (raw.startsWith("+++ ")) {
      seenNew = raw.slice(4).trim();
      if (seenNew === "/dev/null") {
        if (cur) { cur.isDeleted = true; cur.isNew = false; cur.oldPath = stripPrefix(seenOld); }
        else if (seenOld && seenOld !== "/dev/null") {
          cur = { oldPath: stripPrefix(seenOld), newPath: "", isNew: false, isDeleted: true, isRename: false, hunks: [], additions: 0, deletions: 0 };
          files.push(cur);
        }
      } else if (cur) {
        cur.newPath = stripPrefix(seenNew);
        if (!cur.oldPath) cur.oldPath = stripPrefix(seenOld);
        cur.isRename = !!cur.oldPath && cur.oldPath !== cur.newPath;
      } else if (seenOld && seenOld !== "/dev/null") {
        cur = { oldPath: stripPrefix(seenOld), newPath: stripPrefix(seenNew), isNew: false, isDeleted: false, isRename: stripPrefix(seenOld) !== stripPrefix(seenNew), hunks: [], additions: 0, deletions: 0 };
        files.push(cur);
      }
      continue;
    }
    const m = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (m && cur) {
      hunk = {
        index: cur.hunks.length,
        oldStart: Number(m[1]), oldLines: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]), newLines: m[4] ? Number(m[4]) : 1,
        header: m[5].trim(),
        lines: [],
      };
      cur.hunks.push(hunk);
      continue;
    }
    if (!hunk || !cur) continue;
    if (raw.startsWith("+")) { hunk.lines.push({ kind: "add", text: raw.slice(1) }); cur.additions++; }
    else if (raw.startsWith("-")) { hunk.lines.push({ kind: "del", text: raw.slice(1) }); cur.deletions++; }
    else if (raw.startsWith(" ")) hunk.lines.push({ kind: "context", text: raw.slice(1) });
    else if (raw.startsWith("\\")) { /* "\ No newline at end of file" — ignore */ }
  }
  return files.filter((f) => f.hunks.length > 0 || f.isNew || f.isDeleted || f.isRename);
}

/** Line-level diff via LCS (bounded for very large files). */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split("\n"), y = b.split("\n");
  if (x.length * y.length > 4_000_000) {
    return [...x.map((l): DiffLine => ({ kind: "del", text: l })), ...y.map((l): DiffLine => ({ kind: "add", text: l }))];
  }
  const dp = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ kind: "context", text: x[i]! }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ kind: "del", text: x[i++]! });
    else out.push({ kind: "add", text: y[j++]! });
  }
  while (i < x.length) out.push({ kind: "del", text: x[i++]! });
  while (j < y.length) out.push({ kind: "add", text: y[j++]! });
  return out;
}

/** Group a line diff into reviewable hunks with `context` lines of surrounding code. */
export function hunksFromDiff(lines: DiffLine[], context = 3): Hunk[] {
  const changes = lines.map((l, i) => (l.kind !== "context" ? i : -1)).filter((i) => i >= 0);
  if (!changes.length) return [];
  const clusters: Array<[number, number]> = [];
  let s = changes[0]!, prev = changes[0]!;
  for (const i of changes.slice(1)) {
    if (i - prev > 2 * context) { clusters.push([s, prev]); s = i; }
    prev = i;
  }
  clusters.push([s, prev]);
  const hunks: Hunk[] = [];
  let oldLine = 1, newLine = 1, ptr = 0;
  for (const [cs, ce] of clusters) {
    const start = Math.max(0, cs - context);
    const end = Math.min(lines.length - 1, ce + context);
    for (; ptr < start; ptr++) { if (lines[ptr]!.kind !== "add") oldLine++; if (lines[ptr]!.kind !== "del") newLine++; }
    const hunkLines = lines.slice(start, end + 1);
    let oldCount = 0, newCount = 0;
    for (const l of hunkLines) { if (l.kind !== "add") oldCount++; if (l.kind !== "del") newCount++; }
    hunks.push({ index: hunks.length, oldStart: oldLine, oldLines: oldCount, newStart: newLine, newLines: newCount, header: "", lines: hunkLines });
    for (; ptr <= end; ptr++) { if (lines[ptr]!.kind !== "add") oldLine++; if (lines[ptr]!.kind !== "del") newLine++; }
  }
  return hunks;
}

/** Diff two file contents straight into hunks (convenience for review UI). */
export function diffFile(oldText: string, newText: string, context = 3): Hunk[] {
  return hunksFromDiff(diffLines(oldText, newText), context);
}

/** Apply a chosen subset of a file's hunks to its original content. */
export function applyHunks(original: string, file: { hunks: Hunk[] }, chosen: number[]): string {
  const lines = original.split("\n");
  const picked = file.hunks.filter((h) => chosen.includes(h.index)).sort((a, b) => b.oldStart - a.oldStart);
  for (const h of picked) {
    const out: string[] = [];
    for (const l of h.lines) {
      if (l.kind !== "add") out.push(l.text); // context + del consume old lines
    }
    const replacement: string[] = [];
    for (const l of h.lines) {
      if (l.kind !== "del") replacement.push(l.text); // context + add produce new lines
    }
    const start = h.oldStart - 1;
    const consumed = out.length;
    // Verify the hunk matches the current content; skip (don't corrupt) if it doesn't.
    const actual = lines.slice(start, start + consumed);
    if (actual.join("\n") !== out.join("\n")) continue;
    lines.splice(start, consumed, ...replacement);
  }
  return lines.join("\n");
}

export type IntentGroup = { intent: string; files: FileDiff[]; additions: number; deletions: number };

/** Group changed files by top-level area so review reads as intents, not a file pile. */
export function groupByIntent(files: FileDiff[]): IntentGroup[] {
  const groups = new Map<string, IntentGroup>();
  for (const f of files) {
    const path = f.newPath || f.oldPath;
    const parts = path.split("/");
    const area = parts.length > 1 ? (parts[0] === "src" && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0]) : "(root)";
    const g = groups.get(area) ?? { intent: area, files: [], additions: 0, deletions: 0 };
    g.files.push(f); g.additions += f.additions; g.deletions += f.deletions;
    groups.set(area, g);
  }
  return [...groups.values()].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
}

/** One-line "what changed, why, what it affects" summary per file. */
export function summarizeDiff(files: FileDiff[]): string[] {
  return files.map((f) => {
    const path = f.newPath || f.oldPath;
    const what = f.isNew ? "New file" : f.isDeleted ? "Deleted" : f.isRename ? `Renamed from ${f.oldPath}` : "Modified";
    const symbols = [...new Set(f.hunks.map((h) => h.header).filter(Boolean))].slice(0, 3);
    const where = symbols.length ? ` — touches ${symbols.join(", ")}` : "";
    return `${what}: ${path} (+${f.additions}/-${f.deletions})${where}`;
  });
}

export type Checkpoint = {
  id: string;
  label: string;
  createdAt: string;
  files: Record<string, string>; // path -> full content snapshot
};

/** Snapshot a set of files so staged changes can be rolled back later. */
export function createCheckpoint(files: Record<string, string>, label = "checkpoint"): Checkpoint {
  return { id: `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, label, createdAt: new Date().toISOString(), files: { ...files } };
}

/** Restore the snapshot: returns the full file map to write back. */
export function revertToCheckpoint(cp: Checkpoint): Record<string, string> {
  return { ...cp.files };
}

/** Which paths differ from the checkpoint (changed, added, or removed since). */
export function diffAgainstCheckpoint(cp: Checkpoint, current: Record<string, string>): { changed: string[]; added: string[]; removed: string[] } {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [p, content] of Object.entries(current)) {
    if (!(p in cp.files)) added.push(p);
    else if (cp.files[p] !== content) changed.push(p);
  }
  for (const p of Object.keys(cp.files)) if (!(p in current)) removed.push(p);
  return { changed, added, removed };
}
