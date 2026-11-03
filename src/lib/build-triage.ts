/** C25: classify a failed build and propose a concrete fix, not just a report. */
import { diagnoseDeploymentFailure } from "./deployment-diagnosis";
import { redactPreviewDiagnostic } from "./preview-repair";

export type TriageKind = "dep_conflict" | "missing_module" | "type_error" | "oom" | "flaky" | "missing_env" | "config" | "unknown";
export type Triage = { kind: TriageKind; summary: string; proposal: { title: string; steps: string[]; file?: string; line?: number; patch?: string } | null; retryable: boolean };

export function triageBuildFailure(rawLog: string): Triage {
  const log = redactPreviewDiagnostic(rawLog).slice(-16_000);
  const oom = /JavaScript heap out of memory|FATAL ERROR: .*Allocation failed|Reached heap limit|exited with (?:code|signal) (?:137|SIGKILL)|ENOMEM/i;
  if (oom.test(log)) return { kind: "oom", summary: "The build ran out of memory.", retryable: false, proposal: { title: "Give the build more memory", file: "package.json", steps: ["Prefix the build script with NODE_OPTIONS=--max-old-space-size=4096 (or set NODE_OPTIONS in the hosting build environment).", "Look for very large imported assets or data files and lazy-load them."], patch: `"build": "NODE_OPTIONS=--max-old-space-size=4096 <existing build command>"` } };
  const ts = log.match(/([\w./@-]+\.(?:tsx?|mts|cts))[(:](\d+)[,:](\d+)\)?:?\s*-?\s*error (TS\d+):\s*([^\n]+)/);
  if (ts) return { kind: "type_error", summary: `Type error ${ts[4]} in ${ts[1]} line ${ts[2]}.`, retryable: false, proposal: { title: `Fix ${ts[4]} at ${ts[1]}:${ts[2]}`, file: ts[1]!, line: Number(ts[2]), steps: [`Open ${ts[1]} at line ${ts[2]}: ${ts[5]!.trim().slice(0, 200)}`, "Correct the type at its source; do not add any-casts or disable type checking.", "Rerun typecheck and build."] } };
  const peer = log.match(/ERESOLVE[\s\S]{0,600}?(?:peer|requires)\s+([@\w/.-]+)@"?([^"\s]+)"?[\s\S]{0,200}?from\s+([@\w/.-]+)@([\w.^~-]+)/i);
  if (peer) return { kind: "dep_conflict", summary: `${peer[3]}@${peer[4]} needs ${peer[1]}@${peer[2]}.`, retryable: false, proposal: { title: `Align ${peer[1]} with ${peer[3]}`, file: "package.json", steps: [`Change ${peer[1]} to a version satisfying ${peer[2]}, or upgrade ${peer[3]} to a release that supports the installed ${peer[1]}.`, "Update the lockfile with the repo's package manager in the same commit.", "Avoid --force/--legacy-peer-deps unless the user accepts the risk."] } };
  if (/ERESOLVE|conflicting peer dependency|Could not resolve dependency/i.test(log)) return { kind: "dep_conflict", summary: "Dependency versions conflict.", retryable: false, proposal: { title: "Resolve the dependency conflict", file: "package.json", steps: ["Read the first ERESOLVE block to find the two packages that disagree.", "Pin a compatible version of one of them and regenerate the lockfile.", "Rerun a clean install and build."] } };
  const mod = log.match(/(?:Cannot find module|Module not found: (?:Error: )?Can't resolve|Failed to resolve import|Could not resolve)\s+['"]([^'"]+)['"]/);
  if (mod) {
    const spec = mod[1]!;
    const local = /^[./@~]\/|^\.|^@\//.test(spec);
    const pkg = local ? null : spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
    return { kind: "missing_module", summary: `Import "${spec}" cannot be resolved.`, retryable: false, proposal: pkg ? { title: `Add ${pkg} as a dependency`, file: "package.json", steps: [`Install ${pkg} with the repo's package manager so package.json and the lockfile change together.`, "Rebuild."], patch: `"${pkg}": "latest compatible version"` } : { title: `Fix the import path "${spec}"`, steps: ["Check the file exists with that exact name and case (builds on Linux are case-sensitive).", "Update the import or restore the file, then rebuild."] } };
  }
  if (/ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|503 Service Unavailable|registry.*(?:timeout|unavailable)|Internal error occurred/i.test(log)) return { kind: "flaky", summary: "A network or provider hiccup interrupted the build.", retryable: true, proposal: { title: "Rebuild once", steps: ["Retry the same commit once; nothing in the code needs to change.", "If it fails the same way twice, treat it as a real failure and inspect the provider status."] } };
  const d = diagnoseDeploymentFailure(log);
  if (d.category === "missing_environment") return { kind: "missing_env", summary: d.summary, retryable: false, proposal: { title: "Supply the missing environment variable", steps: d.nextActions } };
  if (d.category === "framework_configuration" || d.category === "build_command") return { kind: "config", summary: d.summary, retryable: false, proposal: { title: "Correct the build configuration", steps: d.nextActions } };
  if (d.category !== "unknown") return { kind: "unknown", summary: d.summary, retryable: d.category === "network_or_provider", proposal: { title: "Suggested next steps", steps: d.nextActions } };
  return { kind: "unknown", summary: d.summary, retryable: false, proposal: null };
}
