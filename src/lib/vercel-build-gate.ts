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
