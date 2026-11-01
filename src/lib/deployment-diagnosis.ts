import { redactPreviewDiagnostic } from "./preview-repair";

export type DeploymentFailureCategory =
  | "missing_environment"
  | "dependency_install"
  | "typescript"
  | "lint"
  | "build_command"
  | "framework_configuration"
  | "database_or_auth"
  | "deployment_quota"
  | "network_or_provider"
  | "unknown";

export type DeploymentDiagnosis = {
  category: DeploymentFailureCategory;
  confidence: "high" | "medium" | "low";
  summary: string;
  evidence: string[];
  nextActions: string[];
};

/** Classifies Vercel build evidence without treating log text as instructions or exposing secrets. */
export function diagnoseDeploymentFailure(log: string): DeploymentDiagnosis {
  const safe = redactPreviewDiagnostic(log).slice(-12_000);
  const lines = safe.split("\n").map((line) => line.trim()).filter(Boolean);
  const rules: Array<{ category: DeploymentFailureCategory; pattern: RegExp; summary: string; actions: string[] }> = [
    { category: "deployment_quota", pattern: /deployment.*(?:limit|quota)|too many deployments|resource is limited|deployments-per-day/i, summary: "Vercel refused the deployment because the account reached a deployment limit.", actions: ["Stop retrying builds until the provider limit resets.", "Continue source-level checks without creating more deployments.", "Retry only after Vercel confirms the quota is available."] },
    { category: "missing_environment", pattern: /(?:missing|required|undefined).{0,100}(?:environment variable|env var|SUPABASE|DATABASE_URL|API_KEY)|(?:SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_[A-Z0-9_]+|VITE_[A-Z0-9_]+).{0,80}(?:not set|missing|undefined|required)/i, summary: "The build appears to require an environment variable that is not available in this deployment scope.", actions: ["Identify the variable name only; never print or commit its value.", "Check the task-pinned customer database and Vercel project links.", "Use Connect & sync for the correct Preview/Production/Development scopes, then rebuild the exact commit."] },
    { category: "dependency_install", pattern: /(?:bun install|npm ci|npm install|pnpm install|yarn install).{0,100}(?:failed|error)|lockfile.{0,80}(?:out of date|incompatible|frozen)|cannot resolve package|module not found|ERR_PNPM|ERESOLVE|no matching version/i, summary: "Dependency installation or package resolution failed.", actions: ["Preserve the repository's existing package manager and lockfile.", "Check the first missing/incompatible package and declared runtime version.", "Update the manifest and lockfile together, then run a clean frozen install."] },
    { category: "typescript", pattern: /(?:typescript|tsc|typecheck|type check).{0,120}(?:error|failed)|error TS\d{3,5}/i, summary: "The deployment is blocked by a TypeScript or type-checking error.", actions: ["Fix the first compiler error at its source file and line.", "Do not disable type checking or add blanket any casts.", "Rerun typecheck and the production build."] },
    { category: "lint", pattern: /(?:eslint|prettier|lint).{0,100}(?:error|failed)|error \s+@typescript-eslint\//i, summary: "The configured lint or formatting check failed.", actions: ["Fix the reported rule violations in changed files.", "Keep existing lint rules enabled.", "Rerun lint and the production build."] },
    { category: "build_command", pattern: /command.{0,60}(?:not found|not recognized)|missing script:.*build|no such file or directory|exited with code 127/i, summary: "The configured build command or executable could not be found.", actions: ["Verify the Vercel root directory and package manager.", "Compare the configured build command with package.json scripts.", "Preserve the project's actual framework and build tooling."] },
    { category: "framework_configuration", pattern: /invalid.{0,80}(?:next\.config|vite\.config|vercel\.json|configuration)|unsupported framework|framework preset|output directory.{0,60}(?:not found|missing)/i, summary: "The framework or Vercel project configuration appears inconsistent.", actions: ["Inspect the framework preset, root directory, output directory and config syntax.", "Compare Vercel settings with the repository's actual framework.", "Change only the incorrect setting; do not replace the framework."] },
    { category: "database_or_auth", pattern: /(?:supabase|postgres|database).{0,120}(?:connection refused|permission denied|relation .* does not exist|migration|rls|unauthorized)|(?:auth|jwt).{0,100}(?:redirect|invalid|unauthorized|not allowed)/i, summary: "The build or server startup appears blocked by a database, migration or authentication issue.", actions: ["Separate build-time configuration from live runtime/database failures.", "Check task-pinned project identity, migration status and redirect configuration.", "Never bypass RLS, reset customer data or apply a live migration without approval."] },
    { category: "network_or_provider", pattern: /(?:ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|upstream.*(?:timeout|error)|429 too many requests|rate limit)/i, summary: "A network request or external provider operation failed during the build.", actions: ["Identify the provider and retryability from the actual error.", "Check provider status, task-pinned account access and rate limits.", "Use bounded retries only for transient errors; do not retry quota failures."] },
  ];
  const match = rules.find((rule) => rule.pattern.test(safe));
  if (!match) {
    const evidence = lines.filter((line) => /error|failed|warning|not found|missing/i.test(line)).slice(0, 4).map((line) => line.slice(0, 240));
    return { category: "unknown", confidence: "low", summary: "The build log does not contain enough recognizable evidence to assign a reliable root cause.", evidence, nextActions: ["Inspect the full Vercel build log for the first failure, not only the final exit message.", "Verify the selected repository, branch, commit and Vercel root directory.", "Do not change configuration or credentials based on a guess."] };
  }
  const evidence = lines.filter((line) => match.pattern.test(line)).slice(0, 4).map((line) => line.slice(0, 240));
  return { category: match.category, confidence: evidence.length ? "high" : "medium", summary: match.summary, evidence, nextActions: match.actions };
}
