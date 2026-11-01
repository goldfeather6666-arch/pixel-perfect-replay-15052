// Pure helpers that tell saved service tokens apart by the real account behind them.

export type AccountIdentity = { key: string; name: string };
export type IdentifiedToken = { id: string; last4: string; identity: AccountIdentity | null };

// "supabase · no organizations" was a short-lived auto label that carried no account information.
const GENERIC = new Set(["", "vercel", "supabase", "supabase · no organizations"]);

/** True when a saved label carries no account information (e.g. the default "Vercel"). */
export function isGenericLabel(label: string | null | undefined) {
  return GENERIC.has(String(label ?? "").trim().toLowerCase());
}

/** The label shown for a token: the user's own label wins, otherwise the provider account name. */
export function identityLabel(provider: "vercel" | "supabase", label: string | null | undefined, identity: AccountIdentity | null) {
  if (!isGenericLabel(label)) return String(label).trim();
  if (!identity?.key) return provider === "vercel" ? "Vercel" : "Supabase";
  return `${provider === "vercel" ? "Vercel" : "Supabase"} · ${identity.name}`.slice(0, 80);
}

/** Saved token that already points at the same provider account, if any. */
export function sameAccount(existing: IdentifiedToken[], identity: AccountIdentity) {
  if (!identity.key) return null;
  return existing.find((t) => t.identity?.key === identity.key) ?? null;
}

/** Groups of saved tokens (2+) that belong to one provider account. */
export function duplicateGroups(tokens: IdentifiedToken[]) {
  const by = new Map<string, IdentifiedToken[]>();
  for (const t of tokens) if (t.identity?.key) by.set(t.identity.key, [...(by.get(t.identity.key) ?? []), t]);
  return [...by.values()].filter((g) => g.length > 1);
}

export function duplicateTokenMessage(provider: "vercel" | "supabase", identity: AccountIdentity, last4: string) {
  const name = provider === "vercel" ? "Vercel" : "Supabase";
  return `This token belongs to the same ${name} account (${identity.name}) as your saved token ···${last4}, so it would show the same projects. To add a different ${name} account, sign out of ${name}, sign in to the other account, then create the token there.`;
}
