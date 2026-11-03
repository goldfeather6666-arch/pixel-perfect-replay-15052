export type MaintenanceFinding = { id: string; path: string; category: "dependencies" | "security" | "performance" | "dead-code"; severity: "warning" | "info"; title: string; recommendation: string };
export const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export function maintenanceDue(enabled: boolean, running: boolean, last: string | null, now = Date.now()) {
  return enabled && !running && (!last || now - Date.parse(last) >= MAINTENANCE_INTERVAL_MS);
}
export function maintenancePaths(paths: string[]): string[] {
  return paths.filter((p) => !/(^|\/)(node_modules|dist|build|\.git|vendor)(\/|$)/.test(p) && !/(^|\/)(\.env[^/]*|[^/]*\.(pem|key))$/.test(p))
    .filter((p) => /(^|\/)package\.json$|\.(tsx?|jsx?)$/.test(p)).slice(0, 40);
}
export function inspectMaintenance(files: { path: string; content: string }[]): MaintenanceFinding[] {
  const findings: MaintenanceFinding[] = [];
  const add = (path: string, category: MaintenanceFinding["category"], title: string, recommendation: string) => findings.push({ id: `${category}:${path}:${title}`, path, category, severity: category === "security" ? "warning" : "info", title, recommendation });
  for (const f of files) {
    if (f.path.endsWith("package.json")) {
      try {
        const p = JSON.parse(f.content) as Record<string, unknown>;
        for (const group of ["dependencies", "devDependencies"]) {
          for (const [name, version] of Object.entries((p[group] ?? {}) as Record<string, unknown>)) {
            if (version === "*" || version === "latest" || typeof version === "string" && /^(git\+|https?:)/.test(version)) add(f.path, "dependencies", `Unbounded dependency: ${name}`, `Choose a reviewed, explicit version for ${name}, preserve the lockfile, then run tests. This is not a vulnerability-advisory scan.`);
          }
        }
      } catch { add(f.path, "dependencies", "Invalid package manifest", "Repair the JSON manifest and verify package-manager checks."); }
    }
    if (/\beval\s*\(|new\s+Function\s*\(/.test(f.content)) add(f.path, "security", "Dynamic code execution", "Review input provenance and replace dynamic execution with a constrained parser where possible.");
    if (/dangerouslySetInnerHTML/.test(f.content)) add(f.path, "security", "HTML injection surface", "Verify the HTML source and sanitize untrusted input with an audited library before rendering.");
    if (new TextEncoder().encode(f.content).length > 100_000) add(f.path, "performance", "Large source module", "Measure its bundled size, then split independent route or feature code and verify the performance budget.");
    if (/\b(?:if|while)\s*\(\s*false\s*\)/.test(f.content)) add(f.path, "dead-code", "Unreachable literal branch", "Review and remove the unreachable branch after confirming tests cover the intended behavior.");
  }
  return findings.slice(0, 60);
}