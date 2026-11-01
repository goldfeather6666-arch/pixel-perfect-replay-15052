# Unified Project Control Plane

## Purpose

Provide one customer-facing control plane for projects built by the coding platform. A customer can either connect existing GitHub, Supabase and Vercel resources or authorize the platform to create resources in the customer's own accounts. Forge itself remains hosted on Lovable; this architecture applies only to customer-generated projects.

## Current-state audit (main at 35e045f3a683c7fb9aacb7d53d1b3e480f58b14e)

Existing foundations:
- Provider credentials are stored encrypted and selected per task through `agent_sessions.accounts`.
- Explicit account pins are authoritative; a deleted/unavailable pin does not fall back to another account.
- `integrations.server.ts` provides GitHub, Supabase Management API and Vercel API clients.
- `integrations.functions.ts` exposes resource listing/linking/creation, environment sync, deployment and migration actions.
- `connect.server.ts` performs a sequential "Connect & sync" pass for repository linkage, database environment settings, Supabase Auth return URLs, migration status and deployment/runtime health.
- `migrations.server.ts` applies ordered migration files and records progress on the task.
- Existing tests cover account selection, deployment configuration, migration behavior and connect rules.

Gaps to address:
1. Sync is primarily an in-request sequence, not a durable resumable job with per-step state and idempotency.
2. A partial provider failure can leave earlier external changes applied without a first-class recovery record.
3. Provider account, resource identity and sync state are spread across task columns, encrypted settings and credential rows.
4. Migration progress relies on task-level `applied_migrations`; reconcile it against the actual database migration history before treating it as authoritative.
5. Webhook-driven reconciliation and infrastructure drift detection are not yet a unified lifecycle.
6. The current connection UI separates account connection, resource selection, environment sync, migration application and deployment.
7. MCP is currently an external tool integration surface; it should call the same internal control-plane services, not become the infrastructure synchronization engine.

## Target architecture

```
Customer Project Workspace
  -> Project Control Plane API
      -> Project/provider binding registry
      -> Durable sync job + step ledger
      -> Policy and approval gate
      -> Provider adapters (GitHub App, Supabase Management API/CLI, Vercel OAuth/API)
      -> Webhook inbox + reconciliation worker
      -> Health, drift and recovery service
  -> Agent tools / MCP facade (same internal services)
```

All provider operations must be scoped to the customer and the task's pinned provider account. No operator/platform account fallback is permitted. Credentials remain encrypted and server-side. Never place secrets in GitHub, logs, client responses or MCP tool output.

## Customer experience

- **Connect existing:** authorize providers, select an existing repository/project/website and validate ownership/linkage.
- **Create new:** authorize providers, select an account/organization and region, then create the repository/database/hosting project in the customer's own accounts.
- **One-click Sync:** inspect, plan, show changes and required approvals, execute safe configuration steps, deploy an exact commit and verify runtime health.
- **Approval mode (default):** production migrations, destructive changes, domain/DNS changes, permission expansions and irreversible operations require explicit approval. Read-only inspection and safe idempotent configuration reconciliation can run automatically.
- Every run shows a consolidated result, individual steps, exact target account/resource, commit SHA, retry/recovery status and actionable errors.

## Phased implementation

### Phase 1 — Control-plane contracts (this PR)
- Add pure typed contracts for provider readiness, sync operations, dependencies and approval requirements.
- Generate a deterministic plan without executing external writes.
- Document invariants and the target architecture.
- Add unit tests for missing connections, blocked dependencies, approval gates and deterministic ordering.

### Phase 2 — Durable orchestration
- Add customer-owned sync job and step ledger tables with RLS and service-role-only worker access.
- Use idempotency keys, optimistic state transitions, leases/heartbeats, bounded retries and resumable execution.
- Persist only safe metadata; never persist plaintext provider credentials.
- Add user-scoped APIs to create, inspect, approve, cancel and resume sync jobs.
- Keep provider calls in server-side adapters; worker jobs resolve only the task-pinned credentials.

### Phase 3 — Unified connect/create wizard
- Support importing existing resources and creating new ones.
- Validate GitHub repository ownership and Vercel's linked repository before deployment.
- Validate Supabase organization/project ownership before binding.
- Persist immutable provider account IDs and external resource IDs in the project binding registry.
- Show a dry-run plan and approvals before provisioning or changing resources.

### Phase 4 — Webhooks and reconciliation
- Add verified GitHub and Vercel webhook ingestion with replay protection and idempotent event handling.
- Reconcile external state periodically; detect configuration drift.
- Webhooks enqueue work only; they do not bypass approval policy.
- Add event history and stale-event handling.

### Phase 5 — Agent/MCP interface
- Expose typed project tools through the existing agent tool system.
- MCP tools call the same internal services and policy gates as the UI.
- Separate read-only inspection tools from mutation tools; mutation tools return approval requests where required.
- Never let an MCP server select credentials or resources outside the task's pinned customer bindings.

### Phase 6 — Health, repair and recovery
- Unified provider health, sync history, drift reports and deployment diagnostics.
- Safe retries and compensating actions where provider APIs support them.
- App rollback is distinct from database rollback; database rollback requires a verified reversible migration or restore strategy.
- Repair recommendations are generated from evidence and require approval for external mutations.

## Non-negotiable safety invariants

1. Forge remains deployed on Lovable; customer deployment targets are independent.
2. Customer-owned GitHub, Supabase and Vercel accounts only.
3. A task-pinned account is authoritative; never silently fall back to another account.
4. Verify user ownership of every project, job, approval and resource binding on every server action.
5. Verify repository/project linkage before writing configuration or deploying.
6. No automatic production migration application in approval mode.
7. No destructive operation, domain change, permission expansion or irreversible operation without approval.
8. Use exact commit SHAs for deployment and record them in the job.
9. All steps are idempotent or explicitly marked non-retryable; never blindly retry external writes.
10. Redact credentials, private keys, SQL secrets and provider response bodies from logs and user-visible errors.

## Acceptance criteria

- A user can choose connect-existing or create-new without mixing provider accounts.
- A sync dry run explains every planned action and required approval.
- Partial failures resume from the first incomplete safe step without duplicating successful writes.
- Production migrations remain blocked until the user approves them.
- Provider webhook events cannot mutate resources without passing the same policy gate.
- MCP and UI operations produce identical authorization and audit behavior.
- CI typecheck, lint, unit tests and production build pass before each phase PR is considered ready.
