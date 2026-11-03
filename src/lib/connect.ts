// Pure rules for "Connect & sync": sign-in return links, health steps and the Auto-fix brief.
import { productionInstructions } from "./deployment-quality";

export type StepState = "ok" | "warn" | "fail" | "skip";
export type SyncStep = { key: string; label: string; state: StepState; note: string };

const LOCAL = ["http://localhost:3000/**", "http://localhost:5173/**", "http://localhost:8080/**"];

/** Return links sign-in must allow so login/logout work on the live site, Vercel previews and local dev. */
export function requiredAuthUrls(domains: string[]): string[] {
  const live = domains.filter((d) => /^[a-z0-9.-]+$/i.test(d)).map((d) => `https://${d.toLowerCase()}/**`);
  return [...new Set([...live, "https://*.vercel.app/**", ...LOCAL])];
}

/** Keeps every existing allowed link and adds the missing required ones. */
export function mergeAllowList(existing: string | null | undefined, required: string[]): { value: string; added: string[] } {
  const have = (existing ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const added = required.filter((u) => !have.includes(u));
  return { value: [...have, ...added].join(","), added };
}

/** Only a registered Vercel production domain determines the final site address. */
export function pickSiteUrl(current: string | null | undefined, domains: string[], verifiedCustomDomain?: string): string | null {
  const assigned = verifiedCustomDomain && domains.includes(verifiedCustomDomain) ? verifiedCustomDomain : orderDomains(domains).find((d) => /^[a-z0-9-]+\.vercel\.app$/.test(d));
  const live = assigned ? `https://${assigned}` : null;
  if (!live) return null;
  return current?.replace(/\/$/, "") === live ? null : live;
}

/** Prefer the registered Vercel production alias, then additional custom domains. */
export function orderDomains(domains: string[]): string[] {
  const uniq = [...new Set(domains.map((d) => d.toLowerCase()))];
  const custom = uniq.filter((d) => !d.endsWith(".vercel.app"));
  const vercel = uniq.filter((d) => d.endsWith(".vercel.app")).sort((a, b) => a.length - b.length);
  return [...vercel, ...custom];
}

/** A narrow Management API patch leaves signup, passwords and all other protections untouched. */
export function customerAuthPatch(cfg: { site_url?: string; uri_allow_list?: string; mailer_autoconfirm?: boolean }, domains: string[], verifiedCustomDomain?: string) {
  const merged = mergeAllowList(cfg.uri_allow_list, requiredAuthUrls(domains));
  const site = pickSiteUrl(cfg.site_url, domains, verifiedCustomDomain);
  return {
    ...(cfg.mailer_autoconfirm !== true ? { mailer_autoconfirm: true } : {}),
    ...(merged.added.length ? { uri_allow_list: merged.value } : {}),
    ...(site ? { site_url: site } : {}),
  };
}

export function overall(steps: SyncStep[]): StepState {
  if (steps.some((s) => s.state === "fail")) return "fail";
  if (steps.some((s) => s.state === "warn")) return "warn";
  return steps.some((s) => s.state === "ok") ? "ok" : "skip";
}

