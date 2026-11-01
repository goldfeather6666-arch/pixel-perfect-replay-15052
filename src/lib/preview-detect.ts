// Pure framework / package-manager / command detection for live previews. No I/O.

export type Framework = "next" | "vite" | "astro" | "remix" | "nuxt" | "sveltekit" | "cra" | "static" | "unknown";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type Pkg = { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;

export const PREVIEW_PORTS = [3000, 3001, 4173, 5173, 5174, 8000, 8080, 8787];

export function gatewayBase(previewId: string) {
  return `/api/preview/${previewId}/`;
}

export function detectPackageManager(files: string[]): PackageManager {
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  return "npm";
}

export function detectFramework(pkg: Pkg, files: string[]): Framework {
  if (!pkg) return files.includes("index.html") ? "static" : "unknown";
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const dev = pkg.scripts?.["dev"] ?? "";
  if (deps["next"]) return "next";
  if (deps["@remix-run/dev"] || deps["@react-router/dev"]) return "remix";
  if (deps["nuxt"]) return "nuxt";
  if (deps["@sveltejs/kit"]) return "sveltekit";
  if (deps["astro"]) return "astro";
  if (deps["vite"] || /\bvite\b/.test(dev)) return "vite";
  if (deps["react-scripts"]) return "cra";
  return files.includes("index.html") ? "static" : "unknown";
}

/** First candidate port not in `busy`. */
export function pickPort(busy: number[], preferred?: number): number {
  if (preferred && !busy.includes(preferred)) return preferred;
  return PREVIEW_PORTS.find((p) => !busy.includes(p)) ?? 3000 + Math.floor(Math.random() * 900) + 100;
}

/** Parses `ss -ltn` output into listening ports. */
export function parseListening(ss: string): number[] {
  const out = new Set<number>();
  for (const m of ss.matchAll(/[:\]](\d{2,5})\s/g)) out.add(Number(m[1]));
  return [...out];
}

const RUN: Record<PackageManager, string> = { npm: "npx", pnpm: "pnpm exec", yarn: "yarn", bun: "bunx" };
const INSTALL: Record<PackageManager, string> = { npm: "npm install", pnpm: "pnpm install", yarn: "yarn install", bun: "bun install" };

/**
 * Dev command bound to 0.0.0.0 on `port`. Vite-based servers get the gateway base path so assets and
 * HMR resolve through Forge's private gateway; other frameworks are rewritten at the gateway.
 */
export function devCommand(fw: Framework, pm: PackageManager, port: number, base: string): string {
  const x = RUN[pm];
  switch (fw) {
    case "next": return `${x} next dev -H 0.0.0.0 -p ${port}`;
    case "vite": return `${x} vite --host 0.0.0.0 --port ${port} --strictPort --base ${base}`;
    case "astro": return `${x} astro dev --host 0.0.0.0 --port ${port} --base ${base}`;
    case "sveltekit": return `${x} vite dev --host 0.0.0.0 --port ${port} --strictPort`;
    case "remix": return `${pm} run dev -- --host 0.0.0.0 --port ${port}`;
    case "nuxt": return `${x} nuxi dev --host 0.0.0.0 --port ${port}`;
    case "cra": return `HOST=0.0.0.0 PORT=${port} BROWSER=none ${pm} run start`;
    case "static": return `python3 -m http.server ${port} --bind 0.0.0.0`;
    default: return `${pm} run dev -- --host 0.0.0.0 --port ${port}`;
  }
}

export function installCommand(pm: PackageManager, fw: Framework) {
  return fw === "static" || fw === "unknown" ? "" : `[ -d node_modules ] || ${INSTALL[pm]}`;
}

/** Health: a dev server is "up" once it answers with any status below 500. */
export function isHealthy(code: number) {
  return code > 0 && code < 500 && code !== 403;
}
