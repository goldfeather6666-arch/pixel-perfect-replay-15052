export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk .* failed/i.test(message);
}

/** A mixed Vite dependency generation can detach React's hook dispatcher. */
export function isStaleReactModuleError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { message?: unknown; stack?: unknown };
  return typeof value.message === "string" && typeof value.stack === "string"
    && /Cannot read properties of null \(reading ['"]use(?:State|Effect|Ref|Memo|Context|Reducer|Callback)['"]\)/.test(value.message)
    && /node_modules\/\.vite\/deps\/react(?:\.js|[-_])/.test(value.stack);
}

/** After a server restart, an open page still calls server functions by IDs the new server no longer knows. */
export function isStaleServerFunctionError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  // A restarted dev server answers unknown IDs with an HTML error page, which becomes the thrown message.
  return /Invalid server function ID|Server function (?:info )?not found|^\s*<!doctype html[\s\S]*This page didn.t load/i.test(message);
}

/** An open tab can hold a stale module that imports an export the freshly served module no longer has. */
export function isStaleModuleExportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /does not provide an export named/i.test(message);
}

export function isRecoverableModuleError(error: unknown) {
  return isChunkLoadError(error) || isStaleReactModuleError(error) || isStaleServerFunctionError(error) || isStaleModuleExportError(error);
}

/** Replace a stale manifest with a cache-busted document, with bounded retries. */
const RELOAD_INTERVAL = 15_000;
/** Consecutive reloads allowed before the tab stops chasing a server that keeps changing under it. */
const MAX_RECOVERIES = 3;
const RECOVERY_WINDOW = 90_000;
/** A load that never finishes must not hold recovery open forever. */
const LOAD_SETTLE_LIMIT = 4_000;
let pendingReload: number | null = null;

/** True once the tab has reloaded too many times in a row: chasing a server that keeps changing only blanks the screen. */
export function recoveryExhausted(now: number, attempts: number, windowStart: number) {
  return attempts >= MAX_RECOVERIES && now - windowStart < RECOVERY_WINDOW;
}

/**
 * Build the cache-busted document URL, or null when a reload is not allowed.
 * `attempts` counts reloads already made inside the current `windowStart` budget.
 */
export function chunkRecoveryUrl(href: string, now: number, lastAttempt: number, attempts = 0, windowStart = 0) {
  const url = new URL(href);
  const previous = Math.max(lastAttempt || 0, Number(url.searchParams.get("_forge_refresh")) || 0);
  if (now - previous < RELOAD_INTERVAL) return null; // bounded: at most one reload per 15s, so back-to-back preview restarts still recover
  if (recoveryExhausted(now, attempts, windowStart)) return null; // budget spent: stop reloading forever
  url.searchParams.set("_forge_refresh", String(now));
  return url.href;
}

/** True while a document is still arriving: replacing now would abort the load in flight. */
export function documentIsLoading() {
  return typeof document !== "undefined" && document.readyState !== "complete";
}

export function recoverChunkLoad() {
  if (typeof window === "undefined") return false;
  let previous = 0, attempts = 0, windowStart = 0;
  try {
    previous = Number(window.sessionStorage.getItem("forge-chunk-reload")) || 0;
    attempts = Number(window.sessionStorage.getItem("forge-chunk-reload-tries")) || 0;
    windowStart = Number(window.sessionStorage.getItem("forge-chunk-reload-window")) || 0;
  } catch { /* storage may be blocked */ }
  const now = Date.now();
  if (windowStart && now - windowStart > RECOVERY_WINDOW) { attempts = 0; windowStart = 0; } // budget refilled
  const target = chunkRecoveryUrl(window.location.href, now, previous, attempts, windowStart);
  if (!target) {
    // Inside the throttle window: don't leave the tab calling dead function IDs — come back for the fresh manifest when it expires.
    if (pendingReload == null && attempts < MAX_RECOVERIES) {
      const wait = Math.max(0, previous + RELOAD_INTERVAL - now) + 250;
      pendingReload = window.setTimeout(() => {
        pendingReload = null;
        try {
          window.sessionStorage.removeItem("forge-chunk-reload");
          window.sessionStorage.removeItem("forge-chunk-reload-window");
          window.sessionStorage.setItem("forge-chunk-reload-tries", String(attempts + 1));
        } catch { /* storage may be blocked */ }
        const next = chunkRecoveryUrl(window.location.href, Date.now(), 0, attempts + 1, windowStart || Date.now()) || window.location.href;
        window.location.replace(next);
      }, wait);
    }
    return true;
  }
  const spent = attempts + 1;
  try {
    window.sessionStorage.setItem("forge-chunk-reload", String(now));
    window.sessionStorage.setItem("forge-chunk-reload-tries", String(spent));
    window.sessionStorage.setItem("forge-chunk-reload-window", String(windowStart || now));
  } catch { /* URL also bounds retries */ }
  let done = false;
  const replace = () => {
    if (done) return;
    done = true;
    window.location.replace(target);
  };
  // Never abort a document that is still arriving: wait for it, then swap the stale manifest.
  if (documentIsLoading() && typeof window.addEventListener === "function") {
    window.addEventListener("load", replace, { once: true });
    window.setTimeout(replace, LOAD_SETTLE_LIMIT);
  } else {
    replace();
  }
  return true;
}
