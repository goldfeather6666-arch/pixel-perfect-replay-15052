/** Per-run cache with a shared network limit for master and helper readers. */
export function sharedReads<T>(load: (path: string) => Promise<T>, concurrency = 6) {
  const cache = new Map<string, Promise<T>>();
  let active = 0;
  const waiting: Array<() => void> = [];
  const read = (path: string): Promise<T> => {
    const existing = cache.get(path);
    if (existing) return existing;
    const result = (async () => {
      if (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
      else active++;
      try { return await load(path); }
      finally {
        const next = waiting.shift();
        if (next) next();
        else active--;
      }
    })();
    cache.set(path, result);
    void result.catch(() => { if (cache.get(path) === result) cache.delete(path); });
    return result;
  };
  return { read, clear: () => cache.clear() };
}