import { deploymentEnv, isPublicDatabaseKey } from "./deployment-env";
import { orderDomains } from "./connect";

export type DatabaseSettings = { url: string; publicKey: string; serviceRoleKey?: string };

export async function loadDatabaseSettings(userId: string, taskId: string, ref: string): Promise<DatabaseSettings | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("task_deployment_settings").select("ciphertext, iv")
    .eq("task_id", taskId).eq("user_id", userId).eq("project_ref", ref).maybeSingle();
  if (error) throw new Error("Saved database settings could not be read");
  if (!data) return null;
  const { decryptSecret } = await import("./crypto.server");
  return JSON.parse(await decryptSecret(data.ciphertext, data.iv)) as DatabaseSettings;
}

/** The final public address: verified custom domain first, else Vercel's assigned production domain. */
export function appUrlFor(domains: string[], customDomain?: string): string | undefined {
  if (customDomain && domains.includes(customDomain)) return `https://${customDomain}`;
  const assigned = orderDomains(domains).find((d) => /^[a-z0-9-]+\.vercel\.app$/.test(d));
  return assigned ? `https://${assigned}` : undefined;
}

/** Re-pushes every saved project secret (e.g. Stripe keys) to its Vercel targets so a relinked or new website gets them too. */
export async function resyncProjectSecrets(userId: string, taskId: string, vercelId: string, vercelToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("task_secret_requests").select("name,targets,ciphertext,iv")
    .eq("task_id", taskId).eq("user_id", userId).eq("state", "synced");
  const rows = (data ?? []) as { name: string; targets: string[] | null; ciphertext: string | null; iv: string | null }[];
  if (!rows.length) return 0;
  const { decryptSecret } = await import("./crypto.server");
  const { Vercel } = await import("./integrations.server");
  const v = new Vercel(vercelToken);
  let n = 0;
  for (const r of rows) {
    if (!r.ciphertext || !r.iv) continue;
    const targets = (r.targets?.length ? r.targets : ["production", "preview", "development"]) as ("production" | "preview" | "development")[];
    await v.setEnv(vercelId, { [r.name]: await decryptSecret(r.ciphertext, r.iv) }, targets);
    n++;
  }
  return n;
}

export async function syncTaskDatabase(userId: string, taskId: string, ref: string, vercelId: string, databaseToken: string, vercelToken: string) {
  const { SupabaseMgmt, Vercel } = await import("./integrations.server");
  const saved = await loadDatabaseSettings(userId, taskId, ref);
  const publicKey = saved?.publicKey || await new SupabaseMgmt(databaseToken).anonKey(ref);
  if (!publicKey) throw new Error("Database public settings are not available yet; retry when the project is ready");
  if (!isPublicDatabaseKey(publicKey)) throw new Error("Database public key validation failed; privileged keys cannot be synced to public settings");
  const v = new Vercel(vercelToken);
  const { selectedCustomDomain } = await import("./project-setup.server");
  const domain = await selectedCustomDomain(userId, taskId, vercelId, ref, databaseToken, vercelToken);
  const domains = await v.domains(vercelId).catch(() => [] as string[]);
  const env: Record<string, string> = deploymentEnv(saved?.url || `https://${ref}.supabase.co`, publicKey, saved?.serviceRoleKey, ref);
  await v.setEnv(vercelId, env);
  const appUrl = appUrlFor(domains, domain);
  // Production uses the final public address; previews derive theirs from the request origin.
  if (appUrl) await v.setEnv(vercelId, { APP_URL: appUrl }, ["production"]);
  await resyncProjectSecrets(userId, taskId, vercelId, vercelToken);
  const { syncDeploymentAuth } = await import("./customer-auth.server");
  await syncDeploymentAuth(ref, databaseToken, vercelId, vercelToken, domain);
}
