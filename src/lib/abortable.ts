/** Resolve with `work`, or reject as soon as `signal` aborts (the work keeps running but is no longer awaited). */
export function abortable<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Stopped"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("Stopped"));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

/** Stop waiting even when an SDK stream is stuck in a tool that ignores cancellation. */
export async function* abortableStream<T>(source: AsyncIterable<T>, signal: AbortSignal): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await abortable(iterator.next(), signal);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    // Never let an uncooperative iterator's cleanup hold task completion hostage.
    void iterator.return?.().catch(() => {});
  }
}

/** Human-readable text for a tool error; Error objects otherwise serialize to "{}". */
export function errorText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message || raw.name;
  if (typeof raw === "object" && "message" in raw && typeof (raw as { message: unknown }).message === "string") return (raw as { message: string }).message;
  const s = JSON.stringify(raw);
  return s === "{}" ? String(raw) : s;
}

/**
 * Tool-input validation errors echo the model's whole input before the actual reason, so a
 * truncated summary only showed the echo. Drop the echoed value and keep the reason.
 */
export function toolErrorText(raw: unknown): string {
  const text = errorText(raw);
  const reason = text.indexOf("Error message:");
  if (reason === -1 || !/Invalid input for tool/i.test(text)) return text;
  const tool = /Invalid input for tool ([\w-]+)/i.exec(text)?.[1] ?? "tool";
  return `Invalid input for ${tool}: ${text.slice(reason + "Error message:".length).trim()}`;
}
