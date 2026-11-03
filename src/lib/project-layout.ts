// Pure monorepo detection: picks the folder that holds the runnable web app. No I/O.
import { detectFramework, type Framework } from "./preview-detect";

type Pkg = { name?: string; workspaces?: unknown; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;

export type AppCandidate = { dir: string; pkg: Pkg; files: string[] };

const WEB_FRAMEWORKS: Framework[] = ["next", "vite", "astro", "remix", "nuxt", "sveltekit", "cra"];
const PREFERRED = /(^|\/)(web|app|site|frontend|client|www|dashboard)$/i;

export function isWorkspaceRoot(pkg: Pkg, files: string[]): boolean {
  return Boolean(pkg?.workspaces) || ["pnpm-workspace.yaml", "turbo.json", "lerna.json", "nx.json"].some((f) => files.includes(f));
}

/**
 * Returns "" when the repository root is itself the app; otherwise the relative folder of the best web
 * app candidate (named web/app/site/... first, then any with a dev script). Null when nothing runnable.
 */
export function pickAppDir(root: { pkg: Pkg; files: string[] }, candidates: AppCandidate[]): string | null {
  const rootFw = detectFramework(root.pkg, root.files);
  if (WEB_FRAMEWORKS.includes(rootFw) && !isWorkspaceRoot(root.pkg, root.files)) return "";
  const web = candidates.filter((c) => /^[\w.\-/]+$/.test(c.dir) && WEB_FRAMEWORKS.includes(detectFramework(c.pkg, c.files)));
  const best = web.find((c) => PREFERRED.test(c.dir)) ?? web.find((c) => c.pkg?.scripts?.["dev"]) ?? web[0];
  if (best) return best.dir;
  return WEB_FRAMEWORKS.includes(rootFw) || root.pkg?.scripts?.["dev"] ? "" : null;
}
