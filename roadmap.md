# Forge Platform v2 — Agentic Build Engine (master execution prompt)

## Phase 0 — Audit
- [x] Gap report written: docs/forge-v2-gap-report.md

## Phase 1 — Metrics baseline & telemetry
- [x] Baseline capture: start→first-diff, QA gate duration, autonomy rate (recorder metrics exist; add first-diff + gate timers)

## Phase 2 — Persistent repo index + auto-context
- [x] Symbol/file index persisted per repo across sessions
- [x] Auto-retrieved context (symbols, call sites) instead of re-reading files

## Phase 3 — Incremental cache/build layer
- [x] Content-hash cache for typecheck/lint/test/build in sandbox
- [ ] Warm-start preview via E2B snapshot restore (needs paid idle compute decision)

## Phase 4 — Diff engine + review UI + checkpoints
- [x] Pure diff engine: unified-diff parse, per-hunk select/apply, grouping, checkpoints/revert (src/lib/diff-engine.ts)
- [x] Per-hunk accept/reject in the approvals view; partial accepts commit only chosen hunks (resolvePending edits)
- [x] Checkpoint rewind to any task commit or base (restoreCheckpoint, already in Changes tab)
- [x] Intent-grouped multi-file review layout (groupByIntent surfaced in UI)

## Phase 5 — One-command QA gate
- [x] Gate pipeline: typecheck → lint → unit → e2e → visual → axe → Lighthouse
- [x] Evidence-backed reports with measured numbers; failure taxonomy (flaky/regression/config)

## Phase 6 — Approval UX + auto-PR
- [ ] Guardrail transparency: why an action was blocked
- [ ] One-click approve with full context; auto-PR with demo link

## Phase 7 — Multi-agent coordinator + merge resolver
- [ ] Conflict detection/merge resolver across parallel workers (branch-write-queue serializes today)

## Phase 8 — Plugin/MCP marketplace + VS Code extension (beta, feature-flagged)

## Phase 9 — Enterprise hardening (BYO-model done; residency, SSO/RBAC, audit logs)

## Phase 10 — Full test pass, benchmarks, canary matrix

## Phase 11 — Production release after authorization; docs complete

---

# Completed earlier programs
- [x] Universal Agent Foundation (constitution, prompts, tool broker, delegation, memory, evaluation)
- [x] Env sync + agent deploy (DB settings, APP_URL, secrets to Vercel; sandbox env seeding)
- [x] Redesign + preview database auto-link
- [x] Monorepo app-folder detection; tool-arg repair; preview auto-repair
- [x] Silent auto-recovery (1-min stall, 10-min tool window, 4-min model first-byte)
