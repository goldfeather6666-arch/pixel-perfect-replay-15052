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
- [x] Warm-start preview: skip dependency install when lockfiles unchanged in the task sandbox

## Phase 4 — Diff engine + review UI + checkpoints
- [x] Pure diff engine: unified-diff parse, per-hunk select/apply, grouping, checkpoints/revert (src/lib/diff-engine.ts)
- [x] Per-hunk accept/reject in the approvals view; partial accepts commit only chosen hunks (resolvePending edits)
- [x] Checkpoint rewind to any task commit or base (restoreCheckpoint, already in Changes tab)
- [x] Intent-grouped multi-file review layout (groupByIntent surfaced in UI)

## Phase 5 — One-command QA gate
- [x] Gate pipeline: typecheck → lint → unit → e2e → visual → axe → Lighthouse
- [x] Evidence-backed reports with measured numbers; failure taxonomy (flaky/regression/config)

## Phase 6 — Approval UX + auto-PR
- [x] Guardrail transparency: why an action was blocked
- [x] One-click approve with full context; auto-PR with demo link

## Phase 7 — Multi-agent coordinator + merge resolver
- [x] Conflict detection/merge resolver across parallel workers (branch-write-queue serializes today)

## Phase 9 — Enterprise hardening: audit log done; company sign-in and team roles dropped by user

## Phase 10 — Full test pass done (565/565, typecheck clean)

## Phase 11 — Production release: waiting on user go-ahead to publish

---

# Add-on program (10 tiers, user-supplied 2026-11-03)

## Add-on 3 — Prompt audit / "why did this happen?"
- [ ] Record the user request that drove each change (run → prompt snapshot)
- [ ] Drill-down from any diff/file: prompt → files changed → acceptance criteria → verification evidence
- [ ] Surface it in the Changes tab and in the activity list

## Add-on 1 — Creative Director quality tier
- [ ] Quality-scoring layer (UX / visual / contrast / performance) reviewing output before it ships
- [ ] Style memory: persistent design language per project/org, applied to later builds
- [ ] Auto-tag generated vs human-edited pages so feedback trains the scorer

## Add-on 6 — Performance budget-as-code
- [ ] `budget.json` schema + committed budgets (CWV, JS payload, LCP, CLS)
- [ ] QA gate fails on budget violation; auto-suggest fixes (e.g. lazy-load a heavy component)
- [ ] Compare measured numbers across commits

## Add-on 7 — Bug autopsy / replay
- [ ] Repro artifact on failure: environment, redacted logs, last N diffs
- [ ] One-click "try again" replay of the failed command from saved progress
- [ ] Minimal-reproduction summary attached to the failure report

## Add-on 10 — Model-agnostic gateway dashboard
- [ ] Per-task model choice already exists (BYOK + picker + cost labels); add quality/cost comparison per model across runs

## Add-on 2 — Public share / demo gallery
- [ ] One-click read-only shareable preview link per build, with expiring tokens (no sign-in)
- [ ] Embeddable public gallery of verified builds

## Add-on 4 — Idle mode (opt-in maintenance)
- [ ] Off-by-default scheduler: dependency audit, dead-code detection, security scan, perf suggestions
- [ ] Output as a "recommended patch" list accepted/rejected one click at a time

## Add-on 5 — Collaboration & review badges
- [ ] Review badges with evidence links: agent-authored / human-reviewed / QA-gated
- [ ] Role-based approval order (reviewer → QA → release) — needs the user's team model
- [ ] Slack/Teams/Linear notifications — needs the user's webhook/credentials

## Add-on 8 — Governance & compliance
- [ ] Policy-as-code checks (no secrets, approved libraries, accessible by default)
- [ ] Immutable audit trail exists (audit_log); add retention controls and region pinning — needs the user's policy and region choice

## Add-on 9 — Local authoring companion (VS Code)
- [ ] Editor-side first runs with "sync to Forge cloud when ready"; needs the user's call on extension hosting/publishing

---

# Completed earlier programs
- [x] Universal Agent Foundation (constitution, prompts, tool broker, delegation, memory, evaluation)
- [x] Env sync + agent deploy (DB settings, APP_URL, secrets to Vercel; sandbox env seeding)
- [x] Redesign + preview database auto-link
- [x] Monorepo app-folder detection; tool-arg repair; preview auto-repair
- [x] Silent auto-recovery (1-min stall, 10-min tool window, 4-min model first-byte)
