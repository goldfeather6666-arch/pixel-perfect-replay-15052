import { z } from "zod";

export const domainName = z.string().trim().toLowerCase().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain name without https:// or a path").refine((v) => !v.endsWith(".vercel.app"), "Use your own domain");
export const secretRequestInput = z.object({
  name: z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/).refine((v) => !/^(VITE_|NEXT_PUBLIC_|PUBLIC_|SUPABASE_|VERCEL_|FORGE_|NODE_|PATH$|APP_URL$)/.test(v), "Use a private integration variable, not a public or reserved name"),
  purpose: z.string().min(12).max(400),
  sourceUrl: z.string().url().max(500).refine((v) => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; }),
  targets: z.array(z.enum(["production", "preview", "development"])).min(1).max(3).default(["production"]),
});
export type SecretRequestInput = z.infer<typeof secretRequestInput>;
export type SecretRequestSummary = { id: string; name: string; purpose: string; source_url: string; targets: string[]; state: string; updated_at?: string };
export type DnsRecord = { type: string; name: string; value: string };
export function domainReady(record: { verified?: boolean; redirect?: string | null; gitBranch?: string | null; customEnvironmentId?: string | null }, config: { misconfigured?: boolean }) {
  return record.verified === true && config.misconfigured === false && !record.redirect && !record.gitBranch && !record.customEnvironmentId;
}
export function dnsRecords(domain: string, record: { verification?: DnsRecord[] }, config: { recommendedIPv4?: { value: string[] }[]; recommendedCNAME?: { value: string }[] }): DnsRecord[] {
  const challenges = record.verification ?? [];
  const cname = config.recommendedCNAME?.[0]?.value;
  const ips = config.recommendedIPv4?.[0]?.value ?? [];
  return [...challenges, ...(cname ? [{ type: "CNAME", name: domain, value: cname }] : ips.map((value) => ({ type: "A", name: domain, value })))];
}
export function domainSetupTemplate(domain: string) {
  const origin = `https://${domainName.parse(domain)}`;
  return {
    origin,
    env: { APP_URL: origin },
    authPaths: ["/auth/callback", "/reset-password"],
    agentPrompt: `CUSTOM DOMAIN SETUP: Vercel verified ${origin}. APP_URL now points to this domain and database auth return links were merged without deleting old entries. Inspect the app's actual routes and integration code, use APP_URL server-side and window.location.origin in browser signup/sign-in/password-reset links. Verify signup, sign-in, forgot-password/reset, logout, OAuth return paths, canonical URLs and payment success/cancel/webhook URLs on the new domain. Do not rotate secrets. Use request_secret for missing integration credentials; values never enter chat. Inspect provider-registered callbacks and update only through authorized task-scoped provider access; otherwise report the exact provider settings step. Run production checks; a domain setup does not authorize deployment. Never claim provider callbacks or user flows are verified without testing.`,
    providerNotice: "External OAuth allow lists and payment webhooks need provider access. Any unavailable provider setting will be reported for you to update.",
  };
}