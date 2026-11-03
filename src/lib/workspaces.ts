/** C20: monorepo workspace map, shared dependency version conflicts and move-surviving index paths. */
export type WorkspacePackage = { name: string; dir: string; deps: Record<string, string> };

export function workspaceGlobs(rootPkg: { workspaces?: unknown } | null, pnpmYaml: string | null): string[] {
  const w = rootPkg?.workspaces;
  const fromPkg = Array.isArray(w) ? w : w && typeof w === "object" && Array.isArray((w as { packages?: unknown }).packages) ? (w as { packages: unknown[] }).packages : [];
  const fromPnpm = pnpmYaml ? [...pnpmYaml.matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/gm)].map((m) => m[1]!) : [];
  return [...new Set([...fromPkg, ...fromPnpm].filter((g): g is string => typeof g === "string" && !g.startsWith("!")))];
}

function globToRegex(glob: string) {
  const esc = glob.replace(/\/$/, "").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]+").replace(/\u0000/g, ".*");
  return new RegExp(`^${esc}$`);
}

/** Directories holding a package.json that match the workspace globs. */
export function workspaceDirs(globs: string[], files: string[]): string[] {
  const res = globs.map(globToRegex);
  return files.filter((f) => f.endsWith("/package.json") && !f.includes("node_modules/")).map((f) => f.slice(0, -"/package.json".length)).filter((d) => res.some((r) => r.test(d))).sort();
}

export function parseWorkspacePackage(dir: string, text: string): WorkspacePackage | null {
  try {
    const p = JSON.parse(text) as { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
    return { name: p.name ?? dir, dir, deps: { ...p.peerDependencies, ...p.devDependencies, ...p.dependencies } };
  } catch { return null; }
}

/** External dependencies declared with different ranges in different packages. */
export function versionConflicts(pkgs: WorkspacePackage[]) {
  const internal = new Set(pkgs.map((p) => p.name));
  const by = new Map<string, Map<string, string[]>>();
  for (const p of pkgs) for (const [dep, range] of Object.entries(p.deps)) {
    if (internal.has(dep) || /^(workspace:|file:|link:)/.test(range)) continue;
    const m = by.get(dep) ?? new Map<string, string[]>();
    m.set(range, [...(m.get(range) ?? []), p.name]);
    by.set(dep, m);
  }
  return [...by].filter(([, m]) => m.size > 1).map(([dependency, m]) => ({ dependency, ranges: Object.fromEntries(m) })).sort((a, b) => a.dependency.localeCompare(b.dependency));
}

/** Packages that depend (directly or transitively) on `name` — the blast radius of a cross-package refactor. */
export function dependents(pkgs: WorkspacePackage[], name: string): string[] {
  const out = new Set<string>();
  const queue = [name];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const p of pkgs) if (p.deps[cur] !== undefined && !out.has(p.name) && p.name !== name) { out.add(p.name); queue.push(p.name); }
  }
  return [...out].sort();
}

/**
 * Index rows whose file vanished are remapped to the unique current file with the same name
 * (moved or renamed folder); ambiguous or missing ones are reported as removed.
 */
export function remapMovedPaths(indexed: string[], current: string[]) {
  const live = new Set(current);
  const byName = new Map<string, string[]>();
  for (const f of current) { const n = f.slice(f.lastIndexOf("/") + 1); byName.set(n, [...(byName.get(n) ?? []), f]); }
  const indexedSet = new Set(indexed);
  const moved: Record<string, string> = {};
  const removed: string[] = [];
  for (const old of indexed) {
    if (live.has(old)) continue;
    const candidates = (byName.get(old.slice(old.lastIndexOf("/") + 1)) ?? []).filter((c) => !indexedSet.has(c));
    if (candidates.length === 1) moved[old] = candidates[0]!; else removed.push(old);
  }
  return { moved, removed };
}
