import type { IdentifiedToken } from "./account-identity";

export function serviceClient(provider: "vercel" | "supabase", token: string) {
  return {
    async identity() {
      const { Vercel, SupabaseMgmt } = await import("./integrations.server");
      return provider === "vercel" ? new Vercel(token).identity() : new SupabaseMgmt(token).identity();
    },
  };
}

/** Identifies every saved token of a provider for this user (unreadable/revoked tokens get identity null). */
export async function identifySaved(sb: any, userId: string, provider: "vercel" | "supabase"): Promise<(IdentifiedToken & { label: string })[]> {
  const { data } = await sb.from("provider_credentials").select("id, label, last4, ciphertext, iv").eq("user_id", userId).eq("provider", provider);
  const { decryptSecret } = await import("./crypto.server");
  return Promise.all(((data ?? []) as any[]).map(async (r) => {
    try {
      const identity = await serviceClient(provider, await decryptSecret(r.ciphertext, r.iv)).identity();
      return { id: r.id, last4: r.last4, label: r.label, identity };
    } catch {
      return { id: r.id, last4: r.last4, label: r.label, identity: null };
    }
  }));
}
