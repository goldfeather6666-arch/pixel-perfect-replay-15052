// Forge saves each file as its own commit; letting Vercel build every one burns the daily build limit.
// The gate makes Vercel skip agent/* commits unless the commit message carries DEPLOY_MARKER.
// Vercel ignore-command semantics: exit 0 = skip the build, exit 1 = build.
export const DEPLOY_MARKER = "[forge deploy]";
export const BUILD_GATE_COMMAND =
  `case "$VERCEL_GIT_COMMIT_REF" in agent/*) case "$VERCEL_GIT_COMMIT_MESSAGE" in *"${DEPLOY_MARKER}"*) exit 1;; *) exit 0;; esac;; *) exit 1;; esac`;

/** Decide what to set on the project: only install the gate when the user has no custom ignore command. */
export function gateUpdate(current: string | null | undefined): string | null {
  if (!current || !current.trim()) return BUILD_GATE_COMMAND;
  return null; // already gated, or the user has their own rule — never overwrite it
}

/** Pure mirror of the shell gate, for tests and UI hints. */
export function shouldBuild(branch: string, message: string): boolean {
  if (!branch.startsWith("agent/")) return true;
  return message.includes(DEPLOY_MARKER);
}

// Skipped (ignored) builds still count toward Vercel's daily deployment limit, so the gate alone does not
// save quota. vercel.json `git.deploymentEnabled` stops pushes to agent/* from creating deployments at all;
// Forge then creates exactly one deployment per check through the Vercel API.
export const AGENT_BRANCH_GLOB = "agent/*";

/** Returns new vercel.json text that disables push deployments for agent/* branches, or null when no change is needed or the file can't be safely edited. */
export function withAgentDeploysDisabled(current: string | null | undefined): string | null {
  let cfg: Record<string, unknown> = {};
  if (current && current.trim()) {
    try { cfg = JSON.parse(current); } catch { return null; } // never rewrite a file we can't parse
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return null;
  }
  const git = (cfg.git ?? {}) as Record<string, unknown>;
  if (typeof git !== "object" || Array.isArray(git)) return null;
  const enabled = git.deploymentEnabled;
  if (enabled === false) return null;
  const map = enabled && typeof enabled === "object" ? (enabled as Record<string, unknown>) : {};
  if (map[AGENT_BRANCH_GLOB] === false) return null;
  return JSON.stringify({ ...cfg, git: { ...git, deploymentEnabled: { ...map, [AGENT_BRANCH_GLOB]: false } } }, null, 2) + "\n";
}

export type DeployLimit = { total: number | null; resetAt: number | null };
/** Recognises Vercel's "too many deployments" refusal (e.g. the free plan's 100 per day). */
export function deployLimit(status: number, body: unknown): DeployLimit | null {
  const e = ((body as { error?: unknown })?.error ?? body) as { code?: string; message?: string; resource?: string; limit?: { total?: number; reset?: number } } | null;
  const text = `${e?.code ?? ""} ${e?.message ?? ""} ${e?.resource ?? ""}`;
  if (status !== 429 && !/deployments?-[a-z-]*per-day|resource is limited/i.test(text)) return null;
  return { total: typeof e?.limit?.total === "number" ? e.limit.total : null, resetAt: typeof e?.limit?.reset === "number" ? e.limit.reset : null };
}

export function deployLimitMessage(limit: DeployLimit, now = Date.now()) {
  const cap = limit.total ? `${limit.total} deploys a day` : "a limited number of deploys a day";
  const wait = limit.resetAt && limit.resetAt > now ? ` New builds can start in about ${Math.max(1, Math.ceil((limit.resetAt - now) / 3_600_000))} hour(s).` : " Try again later.";
  return `Vercel's plan allows ${cap} and this account has used them all, so Vercel refused to start a build.${wait} This is not a code error.`;
}
