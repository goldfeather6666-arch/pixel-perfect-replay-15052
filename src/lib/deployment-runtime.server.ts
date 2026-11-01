export type RuntimeCheck = {
  state: "PASSED" | "ERROR" | "UNVERIFIED";
  status: number | null;
  note: string;
};

/** Probe only Vercel-owned deployment hosts; never follow an external redirect or expose response bodies. */
export async function checkDeploymentRuntime(url: string, signal?: AbortSignal): Promise<RuntimeCheck> {
  let target: URL;
  try { target = new URL(url); }
  catch { return { state: "UNVERIFIED", status: null, note: "Runtime check requires a valid Vercel deployment URL." }; }
  if (target.protocol !== "https:" || !/^[a-z0-9-]+\.vercel\.app$/.test(target.hostname) || target.username || target.password || target.port) {
    return { state: "UNVERIFIED", status: null, note: "Runtime check requires a Vercel deployment URL." };
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(target, { redirect: "manual", signal: controller.signal, headers: { Accept: "text/html" }, cache: "no-store" });
      const status = response.status;
      // Status is enough to diagnose this failure; never return the page body, cookies or headers.
      await response.body?.cancel();
      if (status >= 300 && status < 400) {
        const location = response.headers.get("location");
        if (!location) return { state: "UNVERIFIED", status, note: "The deployed page redirects without a destination." };
        const next = new URL(location, target);
        if (next.origin !== target.origin || next.username || next.password) return { state: "UNVERIFIED", status, note: "The preview redirects to another site; page health is unverified." };
        target.href = next.href;
        continue;
      }
      if (status === 401 || status === 403) return { state: "UNVERIFIED", status, note: "Preview access is protected; a successful build does not verify page health." };
      if (status >= 200 && status < 300) return { state: "PASSED", status, note: "The deployed entry page responded successfully. Other pages and signed-in flows still need testing." };
      return { state: "ERROR", status, note: `Vercel built successfully, but the deployed page returns HTTP ${status}. For server errors, inspect Vercel runtime logs, required environment variable names and server-side page queries; repair the cause before declaring success.` };
    }
    return { state: "UNVERIFIED", status: null, note: "Too many page redirects; runtime health is unverified." };
  } catch {
    signal?.throwIfAborted();
    return { state: "UNVERIFIED", status: null, note: "The deployed page could not be checked within 15 seconds. Runtime health is unverified." };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}