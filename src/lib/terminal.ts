// Browser-safe helpers for the task terminal: cwd tracking across stateless sandbox calls and ANSI color parsing.

export const CWD_MARK = "__FORGE_CWD__";

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Wrap a command so it runs in `cwd` and reports the resulting directory, keeping the exit code. */
export function wrapCommand(command: string, cwd: string | null): string {
  const pre = cwd ? `cd ${q(cwd)} 2>/dev/null || true; ` : "";
  return `${pre}${command}\n__c=$?; printf '\\n${CWD_MARK}%s\\n' "$(pwd)"; exit $__c`;
}

/** Remove the cwd marker from output and return the new directory. */
export function extractCwd(stdout: string): { out: string; cwd: string | null } {
  const i = stdout.lastIndexOf(CWD_MARK);
  if (i < 0) return { out: stdout, cwd: null };
  const cwd = stdout.slice(i + CWD_MARK.length).split("\n")[0]!.trim() || null;
  return { out: stdout.slice(0, i).replace(/\n$/, ""), cwd };
}

export type AnsiSpan = { text: string; cls: string };

const FG: Record<number, string> = {
  30: "text-muted-foreground", 31: "text-destructive", 32: "text-success", 33: "text-term-yellow",
  34: "text-term-blue", 35: "text-term-magenta", 36: "text-term-cyan", 37: "text-foreground",
  90: "text-muted-foreground", 91: "text-destructive", 92: "text-success", 93: "text-term-yellow",
  94: "text-term-blue", 95: "text-term-magenta", 96: "text-term-cyan", 97: "text-foreground",
};

/** Split text into styled spans from SGR escape codes; other escapes are dropped. */
export function parseAnsi(input: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let fg = "", bold = false, dim = false;
  const re = /\x1b\[([\d;]*)m|\x1b\[[\d;?]*[A-Za-z]|\r(?!\n)/g;
  let last = 0, m: RegExpExecArray | null;
  const push = (t: string) => { if (t) spans.push({ text: t, cls: [fg, bold && "font-bold", dim && "opacity-60"].filter(Boolean).join(" ") }); };
  while ((m = re.exec(input))) {
    push(input.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] === undefined) continue;
    for (const c of (m[1] || "0").split(";").map(Number)) {
      if (c === 0) { fg = ""; bold = false; dim = false; }
      else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) { bold = false; dim = false; }
      else if (c === 39) fg = "";
      else if (FG[c]) fg = FG[c]!;
    }
  }
  push(input.slice(last));
  return spans;
}
