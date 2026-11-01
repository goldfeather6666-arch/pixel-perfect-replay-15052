// Per-task account choice for services that can have several saved accounts.
export const ACCOUNT_PROVIDERS = ["github", "supabase", "vercel"] as const;
export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[number];
export type TaskAccounts = Partial<Record<AccountProvider, string>>;

type Row = { id: string; provider: string; created_at: string };

/** The task's pinned account when it still exists, otherwise the newest saved account of that service. */
export function resolveAccount<T extends Row>(rows: T[], provider: AccountProvider, accounts?: TaskAccounts | null): T | null {
  const mine = rows.filter((r) => r.provider === provider);
  const pin = accounts?.[provider];
  const pinned = pin ? mine.find((r) => r.id === pin) : undefined;
  if (pinned) return pinned;
  return [...mine].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function cleanAccounts(v: unknown): TaskAccounts {
  const out: TaskAccounts = {};
  if (v && typeof v === "object") for (const p of ACCOUNT_PROVIDERS) {
    const id = (v as Record<string, unknown>)[p];
    if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) out[p] = id;
  }
  return out;
}

/** Account-bound links must not carry over to a different saved credential. */
export function accountSwitchPatch(accounts: unknown, provider: AccountProvider, account: string, currentAccount: string | null) {
  const next = { accounts: { ...cleanAccounts(accounts), [provider]: account } };
  if (currentAccount === account) return next;
  if (provider === "vercel") return { ...next, vercel_project_id: null };
  if (provider === "supabase") return { ...next, supabase_ref: null, applied_migrations: [] };
  return next;
}
