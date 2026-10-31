/** Resolve with `work`, or reject as soon as `signal` aborts (the work keeps running but is no longer awaited). */
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
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

/** Human-readable text for a tool error; Error objects otherwise serialize to "{}". */
export function errorText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message || raw.name;
  if (typeof raw === "object" && "message" in raw && typeof (raw as { message: unknown }).message === "string") return (raw as { message: string }).message;
  const s = JSON.stringify(raw);
  return s === "{}" ? String(raw) : s;
}
