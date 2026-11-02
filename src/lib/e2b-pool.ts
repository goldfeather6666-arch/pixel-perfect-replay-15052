// Pure E2B key pool: several free accounts, rotated round-robin with cooldown on quota/rate failures.
export function e2bKeysFrom(env: Record<string, string | undefined>): string[] {
  const raw = [env["E2B_API_KEY"], ...(env["E2B_API_KEYS"] ?? "").split(/[\s,]+/), env["E2B_API_KEY_1"], env["E2B_API_KEY_2"], env["E2B_API_KEY_3"], env["E2B_API_KEY_4"]];
  return [...new Set(raw.map((k) => (k ?? "").trim()).filter(Boolean))];
}

/** Errors that mean "this account is used up for now" — try the next account. */
export function isQuotaError(message: string) {
  return /\b(429|402|403)\b|rate.?limit|quota|limit (reached|exceeded)|concurrent|too many|insufficient|billing|credits?/i.test(message);
}

export const COOLDOWN_MS = 15 * 60_000;

/** Order to try keys: start after the last used index, skip cooling keys (unless all are cooling). */
export function keyOrder(count: number, cursor: number, cooling: (i: number) => boolean): number[] {
  const all = Array.from({ length: count }, (_, k) => (cursor + k) % count);
  const ready = all.filter((i) => !cooling(i));
  return ready.length ? [...ready, ...all.filter((i) => cooling(i))] : all;
}

/** Server-only at call time: true when at least one E2B account is configured. */
export const hasE2b = () => e2bKeysFrom(process.env as Record<string, string | undefined>).length > 0;
