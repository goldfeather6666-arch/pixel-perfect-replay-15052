import { isStaleServerFunctionError, recoverChunkLoad } from "./chunk-recovery";

/** Inspect RPC failures before TanStack serialization hides the stale manifest message. Never replay a mutation. */
export async function recoveringServerFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.status === 404 || response.status >= 500) {
    const text = await response.clone().text().catch(() => "");
    if (isStaleServerFunctionError(text)) {
      const refreshing = typeof window !== "undefined" && recoverChunkLoad();
      throw new Error(refreshing
        ? "Invalid server function ID: workspace updated; refreshing the saved task."
        : "Invalid server function ID: workspace updated. Refresh this page to reconnect; your saved task is safe.");
    }
  }
  return response;
}