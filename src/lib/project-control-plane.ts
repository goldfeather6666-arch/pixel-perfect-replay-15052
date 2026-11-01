/** Pure planning contracts for the customer-project control plane.
 * This module must not perform provider I/O or resolve credentials.
 */

export const CONTROL_PLANE_PROVIDERS = ["github", "supabase", "vercel"] as const;
export type ControlPlaneProvider = (typeof CONTROL_PLANE_PROVIDERS)[number];
export type ResourceMode = "connect_existing" | "create_new";
export type SyncOperation =
  | "inspect_repository"
  | "verify_database_binding"
  | "verify_deployment_binding"
  | "sync_environment"
  | "sync_auth_redirects"
  | "inspect_migrations"
  | "apply_migrations"
  | "deploy_exact_commit"
  | "verify_runtime";

export type ProviderReadiness = Record<ControlPlaneProvider, {
  connected: boolean;
  accountPinned: boolean;
  resourceSelected: boolean;
}>;

export type SyncPlanInput = {
  mode?: ResourceMode;
  providers: ProviderReadiness;
  hasDatabase: boolean;
  hasDeployment: boolean;
  hasCommit: boolean;
  pendingMigrations: number;
  approvedOperations?: SyncOperation[];
};

export type PlannedSyncStep = {
  operation: SyncOperation;
  dependsOn: SyncOperation[];
  state: "ready" | "blocked" | "approval_required" | "not_applicable";
  reason: string;
  requiresApproval: boolean;
};

export type ProjectSyncPlan = {
  mode: "connect_existing" | "create_new";
  steps: PlannedSyncStep[];
  canStart: boolean;
  requiresApproval: SyncOperation[];
};

const PROVIDER_FOR: Partial<Record<SyncOperation, ControlPlaneProvider>> = {
  inspect_repository: "github",
  verify_database_binding: "supabase",
  verify_deployment_binding: "vercel",
  sync_environment: "vercel",
  sync_auth_redirects: "supabase",
  inspect_migrations: "github",
  apply_migrations: "supabase",
  deploy_exact_commit: "vercel",
  verify_runtime: "vercel",
};

const DEPENDENCIES: Record<SyncOperation, SyncOperation[]> = {
  inspect_repository: [],
  verify_database_binding: [],
  verify_deployment_binding: ["inspect_repository"],
  sync_environment: ["verify_database_binding", "verify_deployment_binding"],
  sync_auth_redirects: ["verify_database_binding", "verify_deployment_binding"],
  inspect_migrations: ["inspect_repository", "verify_database_binding"],
  apply_migrations: ["inspect_migrations"],
  deploy_exact_commit: ["inspect_repository", "verify_deployment_binding", "sync_environment"],
  verify_runtime: ["deploy_exact_commit"],
};

const APPROVAL_REQUIRED = new Set<SyncOperation>(["apply_migrations"]);

function readinessReason(input: SyncPlanInput, operation: SyncOperation): string | null {
  const provider = PROVIDER_FOR[operation];
  if (!provider) return null;
  const status = input.providers[provider];
  if (!status.connected) return `Connect the customer's ${provider} account.`;
  if (!status.accountPinned) return `Select and pin the customer's ${provider} account for this project.`;
  if (provider === "github" && !status.resourceSelected) return "Select the GitHub repository for this project.";
  if (provider === "supabase" && !status.resourceSelected) return "Select the Supabase project for this project.";
  if (provider === "vercel" && !status.resourceSelected) return "Select the Vercel project for this project.";
  return null;
}

function topologicalOrder(): SyncOperation[] {
  return [
    "inspect_repository",
    "verify_database_binding",
    "verify_deployment_binding",
    "sync_environment",
    "sync_auth_redirects",
    "inspect_migrations",
    "apply_migrations",
    "deploy_exact_commit",
    "verify_runtime",
  ];
}

/** Creates a deterministic dry-run plan. It never performs provider calls or external writes. */
export function buildProjectSyncPlan(input: SyncPlanInput): ProjectSyncPlan {
  const operations = topologicalOrder();
  const completed = new Set<SyncOperation>();
  const steps: PlannedSyncStep[] = [];
  const approved = new Set(input.approvedOperations ?? []);

  for (const operation of operations) {
    const optional = operation === "verify_database_binding" && !input.hasDatabase
      || operation === "verify_deployment_binding" && !input.hasDeployment
      || ["sync_environment", "sync_auth_redirects", "inspect_migrations", "apply_migrations"].includes(operation) && !input.hasDatabase
      || ["sync_environment", "sync_auth_redirects", "deploy_exact_commit", "verify_runtime"].includes(operation) && !input.hasDeployment
      || operation === "deploy_exact_commit" && !input.hasCommit
      || operation === "apply_migrations" && input.pendingMigrations === 0;

    if (optional) {
      steps.push({ operation, dependsOn: DEPENDENCIES[operation], state: "not_applicable", reason: "This resource or change is not part of the selected project sync.", requiresApproval: false });
      continue;
    }

    const missing = readinessReason(input, operation);
    if (missing) {
      steps.push({ operation, dependsOn: DEPENDENCIES[operation], state: "blocked", reason: missing, requiresApproval: false });
      continue;
    }

    const unmet = DEPENDENCIES[operation].filter((dep) => !completed.has(dep));
    if (unmet.length) {
      steps.push({ operation, dependsOn: DEPENDENCIES[operation], state: "blocked", reason: `Waiting for prerequisite: ${unmet.join(", ")}.`, requiresApproval: false });
      continue;
    }

    if (APPROVAL_REQUIRED.has(operation) && !approved.has(operation)) {
      steps.push({ operation, dependsOn: DEPENDENCIES[operation], state: "approval_required", reason: "Production database changes require explicit customer approval.", requiresApproval: true });
      continue;
    }

    steps.push({ operation, dependsOn: DEPENDENCIES[operation], state: "ready", reason: "All prerequisites and account checks are satisfied.", requiresApproval: false });
    completed.add(operation);
  }

  const requiresApproval = steps.filter((step) => step.state === "approval_required").map((step) => step.operation);
  return {
    mode: input.mode ?? "connect_existing",
    steps,
    canStart: steps.some((step) => step.state === "ready") && !steps.some((step) => step.state === "blocked"),
    requiresApproval,
  };
}
