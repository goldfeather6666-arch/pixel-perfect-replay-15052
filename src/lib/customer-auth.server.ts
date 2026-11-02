import { customerAuthPatch } from "./connect";
import { SupabaseMgmt, Vercel } from "./integrations.server";

/** Called only from authorized task-scoped connection/deployment operations, never Forge auth. */
export async function syncCustomerAuth(ref: string, databaseToken: string, domains: string[]) {
  const database = new SupabaseMgmt(databaseToken);
  const patch = customerAuthPatch(await database.authConfig(ref), domains);
  if (Object.keys(patch).length) await database.patchAuth(ref, patch);
  const verified = await database.authConfig(ref);
  if (verified.mailer_autoconfirm !== true || (patch.site_url && verified.site_url !== patch.site_url)) {
    throw new Error("Customer signup or production site settings could not be verified");
  }
  return Object.keys(patch);
}

export async function syncDeploymentAuth(ref: string, databaseToken: string, projectId: string, vercelToken: string) {
  const domains = await new Vercel(vercelToken).domains(projectId);
  return syncCustomerAuth(ref, databaseToken, domains);
}