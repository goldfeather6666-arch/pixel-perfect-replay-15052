import { deploymentEnv, isPublicDatabaseKey } from "./deployment-env";

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

export async function syncTaskDatabase(userId: string, taskId: string, ref: string, vercelId: string, databaseToken: string, vercelToken: string) {
  const { SupabaseMgmt, Vercel } = await import("./integrations.server");
  const saved = await loadDatabaseSettings(userId, taskId, ref);
  const publicKey = saved?.publicKey || await new SupabaseMgmt(databaseToken).anonKey(ref);
  if (!publicKey) throw new Error("Database public settings are not available yet; retry when the project is ready");
  if (!isPublicDatabaseKey(publicKey)) throw new Error("Database public key validation failed; privileged keys cannot be synced to public settings");
  await new Vercel(vercelToken).setEnv(vercelId, deploymentEnv(saved?.url || `https://${ref}.supabase.co`, publicKey, saved?.serviceRoleKey, ref));
  const { syncDeploymentAuth } = await import("./customer-auth.server");
  const { selectedCustomDomain } = await import("./project-setup.server");
  const domain = await selectedCustomDomain(userId, taskId, vercelId, ref, databaseToken, vercelToken);
  await syncDeploymentAuth(ref, databaseToken, vercelId, vercelToken, domain);
}