// Lenient repair of malformed tool-call arguments from smaller/BYOK models. Pure; never invents fields.

/** Extracts a JSON object from fenced, prefixed or trailing-comma output. Returns null when unrecoverable. */
export function repairToolInput(raw: string): string | null {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  s = s.slice(start, end + 1);
  const attempts = [s, s.replace(/,\s*([}\]])/g, "$1"), s.replace(/,\s*([}\]])/g, "$1").replace(/'([^'\\]*)'\s*:/g, '"$1":')];
  for (const a of attempts) {
    try {
      const v = JSON.parse(a);
      if (v && typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v);
    } catch { /* try next */ }
  }
  return null;
}
