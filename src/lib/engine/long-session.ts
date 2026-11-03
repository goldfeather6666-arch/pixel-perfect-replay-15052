// Long-session support: surgical edits (no full-file rewrites), context compaction for long runs,
// and phased delivery policy for large builds. Pure so the agent route and tests share it.
import type { TaskClass } from "./discovery";

export type Edit = { find: string; replace: string; all?: boolean | undefined };

/** Applies exact search/replace edits in order. Each `find` must match exactly once unless `all`. */
export function applyEdits(content: string, edits: Edit[]): { ok: true; content: string; replaced: number } | { ok: false; error: string } {
  let out = content;
  let replaced = 0;
  for (const [i, e] of edits.entries()) {
    if (!e.find) return { ok: false, error: `Edit ${i + 1}: find text is empty.` };
    const count = out.split(e.find).length - 1;
    if (count === 0) return { ok: false, error: `Edit ${i + 1}: find text not found. Re-read the file and copy the exact current text.` };
    if (count > 1 && !e.all) return { ok: false, error: `Edit ${i + 1}: find text matches ${count} places. Include more surrounding lines or set all=true.` };
    out = e.all ? out.split(e.find).join(e.replace) : out.replace(e.find, () => e.replace);
    replaced += e.all ? count : 1;
  }
  return { ok: true, content: out, replaced };
}

type Part = { type?: string; toolName?: string; output?: unknown; [k: string]: unknown };
type Msg = { role: string; content: unknown };

/** Size in chars of a tool output. */
function size(v: unknown): number {
  try { return typeof v === "string" ? v.length : JSON.stringify(v ?? "").length; } catch { return 0; }
}

/**
 * Compacts old tool results so 100+ step runs stay inside the model context. Results in the most
 * recent `keepRecent` tool messages are untouched; older results above `maxChars` are replaced by a
 * short preview. Message structure and tool-call pairing are preserved.
 */
export function compactMessages<T extends Msg>(messages: T[], keepRecent = 8, maxChars = 1500): { messages: T[]; compacted: number } {
  const toolIdx = messages.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  const cutoff = new Set(toolIdx.slice(0, Math.max(0, toolIdx.length - keepRecent)));
  let compacted = 0;
  const out = messages.map((m, i) => {
    if (!cutoff.has(i) || !Array.isArray(m.content)) return m;
    const content = (m.content as Part[]).map((p) => {
      if (p.type !== "tool-result" || size(p.output) <= maxChars) return p;
      compacted++;
      const o = p.output as { type?: string; value?: unknown } | undefined;
      const raw = o && "value" in o ? o.value : o;
      const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
      return { ...p, output: { type: "text", value: `[compacted older ${p.toolName ?? "tool"} result, ${text.length} chars; re-run the tool if needed] ${text.slice(0, 400)}` } };
    });
    return { ...m, content } as T;
  });
  return { messages: out, compacted };
}

/** Automatic continuation segments by class: large builds get more room before pausing. */
export function autoContinueSegments(c: TaskClass): number {
  return c === "large" || c === "high_risk" ? 10 : c === "medium" ? 5 : 2;
}

export const LONG_SESSION_RULES = `\nLONG-SESSION ENGINEERING: Prefer edit_file (exact find/replace) for changes to existing files; use write_file/write_files only for new files or full rewrites, so large files are never truncated. Never emit placeholder code ("// ... rest unchanged"). Split very large new modules into focused files under ~400 lines. Older tool results are compacted during long runs: record durable decisions with update_spec/remember instead of relying on earlier outputs, and re-read files before editing them.`;

/** Phased delivery for large work so long builds stay ordered and resumable. */
export function phasePolicy(c: TaskClass): string {
  if (c !== "large" && c !== "high_risk") return "";
  return `\nPHASED DELIVERY (large build): work in waves and keep the spec's acceptance_criteria as the checklist. 1) Architecture: data model, migrations, env/secrets, shared types and contracts. 2) Core logic: server functions, APIs, integrations, business rules. 3) Interface: design tokens, layouts, pages, states (loading/empty/error). 4) Integration: wire data, auth guards, mutations, end-to-end flows. 5) Verification: typecheck, tests, build, preview routes, review. After each wave, call update_spec noting finished and remaining items so a resumed run continues exactly where this stopped. Finish every wave; do not stop after scaffolding.`;
}
