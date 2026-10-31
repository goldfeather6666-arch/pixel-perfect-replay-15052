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

export const COMMAND_SYSTEM = `You convert a plain-language request into ONE bash command for a Linux sandbox containing a git repo (Node/npm available).
Reply with JSON only: {"command":"...","explanation":"one short sentence"}.
Use the given working directory and recent history for context. Prefer safe, non-interactive commands (no vim/top/less; add -y where needed). Chain steps with &&. Never invent secrets.`;

/** Parse the model reply into a command; tolerates code fences or a bare command line. */
export function parseCommandReply(text: string): { command: string; explanation: string } {
  const t = text.trim().replace(/^```\w*\n?|```$/g, "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { command?: unknown; explanation?: unknown };
      if (typeof j.command === "string" && j.command.trim()) return { command: j.command.trim(), explanation: typeof j.explanation === "string" ? j.explanation : "" };
    } catch { /* fall through */ }
  }
  const line = t.split("\n").map((l) => l.replace(/^\$\s*/, "").trim()).find(Boolean);
  if (!line) throw new Error("The model didn't return a command");
  return { command: line, explanation: "" };
}

/** Commands that destroy data or rewrite history are never run automatically. */
export function isRisky(command: string): boolean {
  return /\brm\s+-[a-z]*[rf]|\bgit\s+(push|reset\s+--hard|clean\s+-[a-z]*f)|\bmkfs|\bdd\s+if=|:\(\)\s*\{|\bchmod\s+-R|\bsudo\b|>\s*\/dev\/sd|\bcurl\b[^|]*\|\s*(ba)?sh/.test(command);
}

const KNOWN = new Set("ls cd cat npm npx pnpm yarn bun node git grep rg find echo pwd mkdir rm cp mv touch head tail wc sed awk curl python python3 pip make tsc vite vitest jest docker env export which chmod tree du df ps kill sort uniq xargs tar unzip deno go cargo".split(" "));
const STOP = /\b(and|the|then|all|my|for|with|please|to|of|show|what|how|why|which|from|into|every|files?|folder|project|dependencies|everything)\b/i;

/** Plain-language requests typed into the shell (e.g. "install dependencies and build") go to the AI instead. */
export function looksLikeRequest(input: string): boolean {
  const t = input.trim();
  if (/[-./|><&$=;"'`~*()[\]{}\\]/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 2) return false;
  return !KNOWN.has(words[0]!.toLowerCase()) || (words.length >= 3 && STOP.test(words.slice(1).join(" ")));
}
