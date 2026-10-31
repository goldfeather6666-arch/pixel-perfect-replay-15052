// Relevance ranking for saved project memories (keyword + light stemming + recency).
// Runs locally so it works with any provider; no embeddings or extra model calls.
const STOP = new Set("the a an and or of to in on for with is are be it this that from by as at we you i our your use using add make fix please should can".split(" "));

export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, "") || w);
}

type Mem = { category: string; content: string; updated_at: string };

/** Top memories for a query. Preferences always rank high; ties fall back to recency. */
export function rankMemories<T extends Mem>(mems: T[], query: string, limit = 40, now = Date.now()): T[] {
  const q = terms(query);
  const df = new Map<string, number>();
  const docs = mems.map((m) => new Set(terms(m.content)));
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  const n = mems.length || 1;
  const scored = mems.map((m, i) => {
    const d = docs[i]!;
    let rel = 0;
    for (const t of new Set(q)) if (d.has(t)) rel += Math.log(1 + n / (df.get(t) ?? 1));
    const ageDays = Math.max(0, (now - Date.parse(m.updated_at)) / 86_400_000) || 0;
    const recency = 1 / (1 + ageDays / 30);
    const pref = m.category === "preference" ? 1.5 : 0;
    return { m, s: rel * 2 + recency + pref };
  });
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.m);
}
