/** Silence, not elapsed task duration, determines whether an execution is stuck. */
export const NO_PROGRESS_MS = 15 * 60_000;

export function agentLiveness(now = Date.now()) {
  let lastProgress = now;
  return {
    progress(at = Date.now()) { lastProgress = at; },
    stalled(at = Date.now()) { return at - lastProgress >= NO_PROGRESS_MS; },
  };
}