// Free-plan limits on custom (OpenAI-compatible) providers such as ZRO: concurrency caps and daily usage.

export type PlanLimit = "concurrency" | "daily" | null;

export function classifyPlanLimit(body: string): PlanLimit {
  if (/(limited number of requests at once|concurrent|too many (parallel|simultaneous)|requests in flight)/i.test(body)) return "concurrency";
  if (/(today'?s free usage|daily (limit|quota)|per day|resets in \d+h)/i.test(body)) return "daily";
  return null;
}

type Gate = { limit: number; active: number; queue: (() => void)[] };
const gates = new Map<string, Gate>();

async function acquire(g: Gate) {
  if (g.active < g.limit) { g.active++; return; }
  await new Promise<void>((r) => g.queue.push(r));
  g.active++;
}
function release(g: Gate) {
  g.active--;
  g.queue.shift()?.();
}

/**
 * Per-key request gate. After the provider says "one request at a time", that key drops to one
 * request in flight so the agent's calls queue instead of failing and retrying. Concurrency refusals
 * are retried with backoff (max 4); daily-usage refusals return immediately.
 */
export function planLimitFetch(key: string, inner: typeof fetch = fetch, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): typeof fetch {
  const g = gates.get(key) ?? { limit: 4, active: 0, queue: [] };
  gates.set(key, g);
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    for (let attempt = 0; ; attempt++) {
      await acquire(g);
      let res: Response;
      try { res = await inner(input, init); } catch (e) { release(g); throw e; }
      if (res.status !== 429 && res.status !== 402 && res.status !== 403) {
        // Hold the slot until the (possibly streamed) body finishes, so the cap covers the whole request.
        if (!res.body) { release(g); return res; }
        let done = false;
        const finish = () => { if (!done) { done = true; release(g); } };
        const reader = res.body.getReader();
        const body = new ReadableStream({
          async pull(c) { try { const { value, done: d } = await reader.read(); if (d) { finish(); c.close(); } else c.enqueue(value); } catch (e) { finish(); c.error(e); } },
          cancel(r) { finish(); return reader.cancel(r); },
        });
        return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
      }
      const text = await res.clone().text();
      release(g);
      if (classifyPlanLimit(text) !== "concurrency" || attempt >= 4 || init?.signal?.aborted) return res;
      g.limit = 1;
      await sleep(Math.min(20_000, 2_000 * 2 ** attempt));
    }
  }) as typeof fetch;
}

export function planLimitMessage(message: string): string | null {
  const k = classifyPlanLimit(message);
  if (k === "daily") return "Your AI provider's free plan has used up today's allowance. Wait for it to reset, switch this task to another key with the model picker, or upgrade that provider plan. Everything done so far is saved.";
  if (k === "concurrency") return "Your AI provider's free plan only runs one request at a time and stayed busy. Forge now sends one request at a time on this key; wait a moment and send “continue”. Everything done so far is saved.";
  return null;
}
