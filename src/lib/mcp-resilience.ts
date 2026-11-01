export type McpRetryOptions = {
  readOnly: boolean;
  timeoutMs?: number;
  retries?: number;
  delayMs?: number;
};

export type McpOperationResult<T> = {
  value: T;
  attempts: number;
  durationMs: number;
};

/** Never retry writes: a timed-out remote write may already have completed. */
export function isTransientMcpError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b(?:429|500|502|503|504)\b|rate.?limit|temporar|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|fetch failed|network error|socket hang up/i.test(message);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bound a single MCP operation. Only explicitly read-only operations can receive one bounded
 * retry for transient provider/network errors. A timeout is never retried because the remote
 * server may still be processing the original request.
 */
export async function runMcpOperation<T>(
  operation: () => Promise<T>,
  options: McpRetryOptions,
): Promise<McpOperationResult<T>> {
  const timeoutMs = Math.max(1000, Math.min(60_000, options.timeoutMs ?? 25_000));
  const retries = options.readOnly ? Math.max(0, Math.min(1, options.retries ?? 1)) : 0;
  const delayMs = Math.max(0, Math.min(2000, options.delayMs ?? 300));
  const started = Date.now();
  let attempts = 0;
  while (true) {
    attempts += 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("MCP operation timed out")), timeoutMs);
      });
      const value = await Promise.race([operation(), timeout]);
      return { value, attempts, durationMs: Date.now() - started };
    } catch (error) {
      if (attempts > retries || !isTransientMcpError(error) || /timed out/i.test(error instanceof Error ? error.message : String(error))) throw error;
      await wait(delayMs * attempts);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
