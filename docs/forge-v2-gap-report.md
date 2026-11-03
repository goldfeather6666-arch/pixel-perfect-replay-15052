# Forge Platform v2 — Phase 0 Gap Report

Audit of the existing Forge architecture against the v2 backlog (C1–C12). Date: 2026-11-03.

## What already exists (do not rebuild)

| Area | Existing capability | Location |
|---|---|---|
| Auth & approvals | Owner-scoped approvals, staged writes in `agent_sessions.pending`, MCP approval flow, DB approval | `mcp-approval.*`, `approval-resume.ts`, `DatabaseApproval.tsx` |
| Run recording | Durable run recorder with stages, events, metrics, error taxonomy | `engine/recorder.server.ts`, `engine/lifecycle.ts`, `engine/errors.ts` |
| Resume checkpoints | Run-resume checkpoint from recorded milestones (not file checkpoints) | `engine/checkpoint.ts` |
| Parallel agents | Master/specialist teams, work splitting, branch write queue serialization | `agent-team.ts`, `work-split.ts`, `branch-write-queue.ts` |
| Sandboxes | E2B + runner-box, env seeding, preview manager, auto-repair (3 rounds) | `sandbox.server.ts`, `runner-box.server.ts`, `preview-manager.server.ts`, `preview-repair.ts` |
| Deployment | Vercel token flow, build gate, build review, custom domains, env sync | `deployment-*.ts`, `vercel-build-*.ts` |
| BYOK | Encrypted owner keys, per-provider quota handling, model pricing/free labels | `providers.*`, `google-quota.ts`, `provider-limits.ts`, `model-pricing.ts` |
| Liveness | 1-min stall, 10-min tool window, 4-min model first-byte, silent auto-recovery | `agent-liveness.ts`, `run-resume.ts` |
| Skills | Free-only audited skills, platform skills auto-load | `free-skills.ts`, `agent-skills.ts` |
| Memory | 6-tier memory, repo memory, memory ranking | `engine/memory-*.ts`, `shared-reads.ts` |

## Gaps vs the v2 backlog

- **C1 Diff review & checkpoints (highest impact):** No unified-diff parsing, no per-hunk accept/reject, no file-level checkpoints/rewind. Staged changes exist but are all-or-nothing. → Phase 4.
- **C2 Latency:** Repo tree cache exists; no incremental typecheck/lint/test cache in sandboxes; no warm preview snapshots. → Phase 3.
- **C3 Persistent codebase context:** Repo memory stores notes, not a queryable symbol/file index; agents re-read files each run. → Phase 2.
- **C4 Verification gate:** Deployment quality rules and build review exist, but no single QA gate command producing an evidence report with measured numbers and failure taxonomy. → Phase 5.
- **C5 HITL UX:** Approvals work but don't explain guardrail reasons; PRs are created without per-PR demo links. → Phase 6.
- **C6 Parallelism:** Write serialization exists; no conflict detection or merge resolver between parallel workers. → Phase 7.
- **C7 Extensibility:** MCP connections exist; no marketplace, no VS Code extension. → Phase 8 (feature-flagged).
- **C8 Enterprise:** BYOK done; no residency controls, SSO/RBAC, or audit-log surface. → Phase 9.
- **Metrics (Part G):** Recorder captures run metrics; missing first-diff latency, QA-gate duration, and autonomy-rate baselines. → Phase 1.

## Execution constraints carried forward

- Backward compatibility: existing build/preview/secret flows unchanged.
- Secrets stay server-side; RLS and approval gating never weakened.
- Every new service gets unit tests; phases verified before marked complete.
- New surfaces feature-flagged for canary rollout.
