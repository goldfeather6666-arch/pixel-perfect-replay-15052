/** Silence, not elapsed task duration, determines whether an execution is stuck. */
export const NO_PROGRESS_MS = 60_000;
/**
 * Slow BYOK services (free shared tiers) can take 90s+ before the first byte of a reply.
 * While a model request is open and nothing has arrived yet, allow this longer bounded window.
 */
export const MODEL_FIRST_RESPONSE_MS = 4 * 60_000;

export function agentLiveness(now = Date.now()) {
  let lastProgress = now;
  let awaitingSince: number | null = null;
  return {
    progress(at = Date.now()) { lastProgress = at; awaitingSince = null; },
    /** A request was sent to the model; silence until its first byte gets the longer window. */
    awaitModel(at = Date.now()) { lastProgress = at; awaitingSince = at; },
    awaitingSince() { return awaitingSince; },
    stalled(at = Date.now()) {
      if (awaitingSince !== null) return at - awaitingSince >= MODEL_FIRST_RESPONSE_MS;
      return at - lastProgress >= NO_PROGRESS_MS;
    },
  };
}
