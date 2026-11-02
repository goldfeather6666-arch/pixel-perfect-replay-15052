// Cursor-style @-mentions: @file:path, @skill:name, @mcp:name. Pure helpers shared by chat UI and agent.
export type MentionKind = "file" | "skill" | "mcp";
export type Mentions = { file: string[]; skill: string[]; mcp: string[] };

const TOKEN = /(^|\s)@(file|skill|mcp):([^\s]+)/g;

export function parseMentions(text: string): Mentions {
  const out: Mentions = { file: [], skill: [], mcp: [] };
  for (const m of text.matchAll(TOKEN)) {
    const kind = m[2] as MentionKind;
    const value = m[3]!.replace(/[.,;:!?)]+$/, "");
    if (value && !out[kind].includes(value) && out[kind].length < 10) out[kind].push(value);
  }
  return out;
}

/** The @token being typed at the caret, if any: kind may be null while the user has typed only "@ab". */
export function activeMention(text: string, caret: number): { start: number; kind: MentionKind | null; query: string } | null {
  if (caret < 0) return null;
  const before = text.slice(0, caret);
  const m = /(^|\s)@((file|skill|mcp):)?([^\s:]*)$/.exec(before);
  if (!m) return null;
  return { start: caret - m[0].length + m[1]!.length, kind: (m[3] as MentionKind | undefined) ?? null, query: m[4] ?? "" };
}

export function insertMention(text: string, at: { start: number }, caret: number, kind: MentionKind, value: string) {
  const token = `@${kind}:${value} `;
  const next = text.slice(0, at.start) + token + text.slice(caret);
  return { text: next, caret: at.start + token.length };
}

/** Safe repo-relative path only. */
export const mentionPathOk = (p: string) => /^[\w@.\-/]+$/.test(p) && !p.split("/").includes("..") && !p.startsWith("/");
