/** C18: turn runtime stack traces into repository file:line locations. */
export type SourceLocation = { file: string; line: number; column: number; fn: string | null };

const V8 = /at (?:(.+?) \()?((?:https?:\/\/|file:\/\/|webpack(?:-internal)?:\/\/+|\/)[^\s()]+?):(\d+):(\d+)\)?/g;
const GECKO = /(?:^|\s)([\w$.<>]*)@((?:https?:\/\/|webpack:\/\/|\/)[^\s@]+?):(\d+):(\d+)/g;

export function normalizeFramePath(raw: string): string | null {
  let p = raw.replace(/^webpack(?:-internal)?:\/\/+(?:\[name\]\/)?(?:\(.*?\)\/)?/, "/").replace(/^file:\/\//, "");
  try { if (/^https?:\/\//.test(p)) p = new URL(p).pathname; } catch { return null; }
  p = p.split("?")[0]!.split("#")[0]!.replace(/^\/@fs\/.*?\/(?=src\/|app\/|pages\/|lib\/|components\/)/, "/").replace(/^\/+\.?\/?/, "");
  if (!p || /(^|\/)node_modules\/|^\.?vite\/|^_next\/static\/chunks\/|^assets\/.*-[A-Za-z0-9_-]{6,}\.js$|^@vite\/|^@react-refresh/.test(p)) return null;
  return p;
}

/** Repository-relative locations found in stack text; matched against the file list by suffix when provided. */
export function sourceLocations(text: string, files: string[] = [], max = 12): SourceLocation[] {
  const out: SourceLocation[] = [];
  const seen = new Set<string>();
  for (const re of [V8, GECKO]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m && out.length < max; m = re.exec(text)) {
      const norm = normalizeFramePath(m[2]!);
      if (!norm) continue;
      const file = files.length ? files.find((f) => f === norm || f.endsWith(`/${norm}`) || norm.endsWith(`/${f}`)) : norm;
      if (!file) continue;
      const key = `${file}:${m[3]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ file, line: Number(m[3]), column: Number(m[4]), fn: m[1] ? m[1].trim() || null : null });
    }
  }
  return out;
}
