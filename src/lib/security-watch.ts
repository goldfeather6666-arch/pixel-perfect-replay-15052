/** C22: dependency-bump vulnerability watch (OSV.dev, free) and secret-age rotation reminders. */
export type DepChange = { name: string; from: string | null; to: string };
type Pkg = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

function deps(text: string | null): Record<string, string> {
  if (!text) return {};
  try { const p = JSON.parse(text) as Pkg; return { ...p.devDependencies, ...p.dependencies }; } catch { return {}; }
}

/** Added or changed dependencies between two package.json versions. */
export function changedDependencies(before: string | null, after: string): DepChange[] {
  const a = deps(before), b = deps(after);
  return Object.entries(b).filter(([n, v]) => a[n] !== v).map(([name, to]) => ({ name, from: a[name] ?? null, to }));
}

/** Concrete version a range resolves to at minimum; null for tags, URLs and workspace links. */
export function floorVersion(range: string): string | null {
  const m = range.trim().match(/^[\^~>=v ]*(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
  return m ? m[1]! : null;
}

export type Vulnerability = { package: string; version: string; ids: string[] };

/** Queries OSV for each changed package; network failures return null (unverified), never "clean". */
export async function osvCheck(changes: DepChange[], fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<Vulnerability[] | null> {
  const queries = changes.map((c) => ({ c, version: floorVersion(c.to) })).filter((q): q is { c: DepChange; version: string } => !!q.version).slice(0, 100);
  if (!queries.length) return [];
  try {
    const res = await fetchImpl("https://api.osv.dev/v1/querybatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: queries.map((q) => ({ package: { name: q.c.name, ecosystem: "npm" }, version: q.version })) }), ...(signal ? { signal } : {}) });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: { vulns?: { id: string }[] }[] };
    return (body.results ?? []).map((r, i) => ({ package: queries[i]!.c.name, version: queries[i]!.version, ids: (r.vulns ?? []).map((v) => v.id).slice(0, 10) })).filter((v) => v.ids.length);
  } catch { return null; }
}

export const DEFAULT_SECRET_MAX_AGE_DAYS = 90;

export function secretAge(updatedAt: string | null | undefined, now = Date.now(), maxDays = DEFAULT_SECRET_MAX_AGE_DAYS) {
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(t)) return { days: null as number | null, due: false };
  const days = Math.floor((now - t) / 86_400_000);
  return { days, due: days >= maxDays };
}
