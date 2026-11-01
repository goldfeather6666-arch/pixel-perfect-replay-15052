import { cleanAccounts, resolveAccount, type AccountProvider } from "./accounts";

/** Loads the credential row (with ciphertext) a task should use for a service; RLS/user filter scopes it. */
export async function accountRow(sb: any, userId: string, provider: AccountProvider, accounts?: unknown) {
  const { data } = await sb.from("provider_credentials").select("*").eq("user_id", userId).eq("provider", provider);
  return resolveAccount((data ?? []) as any[], provider, cleanAccounts(accounts));
}

export async function accountToken(sb: any, userId: string, provider: AccountProvider, accounts?: unknown): Promise<string | null> {
  const row = await accountRow(sb, userId, provider, accounts);
  if (!row) return null;
  const { decryptSecret } = await import("./crypto.server");
  return decryptSecret(row.ciphertext, row.iv);
}
