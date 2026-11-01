// Commit-aware repository tree cache shared across runs in the same server instance.
// Valid only while the branch head SHA is unchanged, so new commits invalidate automatically.
type Entry = { sha: string; files: string[]; at: number };
const MAX_ENTRIES = 50;
const TTL_MS = 30 * 60_000;
const cache = new Map<string, Entry>();

export function treeKey(owner: string, repo: string, branch: string) {
  return `${owner}:${repo}@${branch}`;
}
export function getCachedTree(key: string, sha: string, now = Date.now()): string[] | null {
  const e = cache.get(key);
  if (!e || e.sha !== sha || now - e.at > TTL_MS) return null;
  return e.files;
}
export function putCachedTree(key: string, sha: string, files: string[], now = Date.now()) {
  cache.delete(key);
  cache.set(key, { sha, files, at: now });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}
/** Loads the tree, reusing the cached copy when the head commit is unchanged. */
export async function cachedTree(key: string, headSha: () => Promise<string>, load: () => Promise<string[]>): Promise<{ files: string[]; hit: boolean }> {
  let sha: string | null = null;
  try { sha = await headSha(); } catch { /* fall through to a fresh load */ }
  if (sha) { const hit = getCachedTree(key, sha); if (hit) return { files: hit, hit: true }; }
  const files = await load();
  if (sha) putCachedTree(key, sha, files);
  return { files, hit: false };
}
