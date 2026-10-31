// Serializes commits to the same repo branch and retries GitHub's branch-moved conflicts.
// The GitHub contents API makes one commit per call; parallel calls on one branch race
// for the branch head and lose with 409 ("is at X but expected Y") or 422 sha mismatch.

const queues = new Map<string, Promise<unknown>>();

export function serializeBy<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  const tail = next.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return next;
}

export function isBranchConflict(e: unknown): boolean {
  const s = String(e instanceof Error ? e.message : e);
  return /GitHub 409/.test(s) || (/GitHub 422/.test(s) && /sha/i.test(s));
}

export async function retryOnConflict<T>(fn: () => Promise<T>, attempts = 5, baseDelayMs = 250): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isBranchConflict(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i + Math.random() * baseDelayMs));
    }
  }
  throw last;
}

/** One commit at a time per repo+branch, re-reading file sha on each retry. */
export function commitSafely<T>(repo: string, branch: string, fn: () => Promise<T>): Promise<T> {
  return serializeBy(`${repo.toLowerCase()}@${branch}`, () => retryOnConflict(fn));
}
