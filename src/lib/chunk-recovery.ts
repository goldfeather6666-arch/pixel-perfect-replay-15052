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

export function isRecoverableModuleError(error: unknown) {
  return isChunkLoadError(error) || isStaleReactModuleError(error) || isStaleServerFunctionError(error);
}

/** Replace a stale manifest with a cache-busted document, with bounded retries. */
export function chunkRecoveryUrl(href: string, now: number, lastAttempt: number) {
  const url = new URL(href);
  const previous = Math.max(lastAttempt || 0, Number(url.searchParams.get("_forge_refresh")) || 0);
  if (now - previous < 60_000) return null;
  url.searchParams.set("_forge_refresh", String(now));
  return url.href;
}

export function recoverChunkLoad() {
  let previous = 0;
  try { previous = Number(window.sessionStorage.getItem("forge-chunk-reload")) || 0; } catch { /* storage may be blocked */ }
  const now = Date.now();
  const target = chunkRecoveryUrl(window.location.href, now, previous);
  if (!target) return false;
  try { window.sessionStorage.setItem("forge-chunk-reload", String(now)); } catch { /* URL also bounds retries */ }
  window.location.replace(target);
  return true;
}