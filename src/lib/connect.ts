// Pure rules for "Connect & sync": sign-in return links, health steps and the Auto-fix brief.

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

/** Site address: keep a real one; replace empty/localhost with the live domain. */
export function pickSiteUrl(current: string | null | undefined, domains: string[]): string | null {
  const live = domains[0] ? `https://${domains[0].toLowerCase()}` : null;
  if (!live) return null;
  if (!current || /localhost|127\.0\.0\.1/.test(current)) return live;
  return null;
}

/** Prefer a custom domain, then the shortest *.vercel.app production alias. */
export function orderDomains(domains: string[]): string[] {
  const uniq = [...new Set(domains.map((d) => d.toLowerCase()))];
  const custom = uniq.filter((d) => !d.endsWith(".vercel.app"));
  const vercel = uniq.filter((d) => d.endsWith(".vercel.app")).sort((a, b) => a.length - b.length);
  return [...custom, ...vercel];
}

export function overall(steps: SyncStep[]): StepState {
  if (steps.some((s) => s.state === "fail")) return "fail";
  if (steps.some((s) => s.state === "warn")) return "warn";
  return steps.some((s) => s.state === "ok") ? "ok" : "skip";
}

/** The focused repair brief Auto-fix sends to the agent; only real blockers, never secrets. */
export function autoFixPrompt(steps: SyncStep[], buildErrors: string[]): string | null {
  const problems = steps.filter((s) => s.state === "fail" || s.state === "warn");
  if (!problems.length && !buildErrors.length) return null;
  const lines = [
    "AUTO-FIX: make this project build, deploy and work (including sign-in and sign-out) on the live site.",
    "Connections were already synced by Forge (database settings in Vercel, sign-in return links, migrations). Remaining blockers:",
    ...problems.map((p) => `- ${p.label}: ${p.note}`),
    ...(buildErrors.length ? ["Latest build errors:", ...buildErrors.slice(0, 12).map((e) => `  ${e}`)] : []),
    "",
    "Rules: follow the deployment-safe-coding skill; fix root causes in code, not by disabling checks; keep server-only keys out of browser code;",
    "sign-in must use the current site address for return links and sign-out must clear the session and return to the sign-in page;",
    "run deployment_preflight, then deploy_status, and repeat at most 3 repair rounds. Finish with one short result: live and working, or the single remaining blocker.",
  ];
  return lines.join("\n");
}
