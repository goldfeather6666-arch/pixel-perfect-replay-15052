export function watchForStop(read: () => Promise<boolean>, controller: AbortController, intervalMs = 2000) {
  let busy = false;
  let closed = false;
  const check = async () => {
    if (busy || closed || controller.signal.aborted) return;
    busy = true;
    try { if (await read() && !closed) controller.abort(); } catch { /* retry at next poll */ }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void check(); }, intervalMs);
  void check();
  return () => { closed = true; clearInterval(timer); };
}