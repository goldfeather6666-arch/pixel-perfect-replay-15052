# Forge roadmap

## Forge v3 (uploaded master prompt; implementation authorized)
Complete C1–C16 incrementally with measured evidence. Preserve owner scope and consent; release remains separately authorized. Uploaded scope supersedes the former marketplace/company exclusions.

## Add-ons (authorized scope)
- [x] 1 Creative Director — `quality_score` tool scores the served HTML (contrast, headings, labels, alt, targets, metadata, measured LCP/payload) with blocker/major caps; `remember_style` tool + `style_memory` table record the project's palette/typefaces/radii/tokens and inject them into later tasks.
- [x] 1b Auto-tag changed files from exact Git blob evidence; later human edits are distinguished, historical missing evidence stays unknown.
- [ ] 2 Public share links + demo gallery — explicit owner-selected verified builds only; read-only expiring/revocable tokens, private by default.
- [x] 3 Prompt audit — `change_provenance` records prompt→path→run; "Why" dialog shows prompt, QA evidence and acceptance criteria per file.
- [ ] 4 Ambient idle mode — opt-in daily bounded source inspection is wired to Changes; recommendations can be dismissed or sent for agent review. Full advisory/dependency graph audits, durable background scheduling and concrete precomputed patches remain.
- [ ] 5 Review badges + role approvals + Slack/Teams notices — needs a Slack app or incoming webhook from the user to activate.
- [x] 6 Budget-as-code — `budget.json` validated, payloads measured in the QA gate, breaches block handoff with fixes.
- [x] 7 Bug autopsy — repro artifact card (environment, redacted evidence, changed files, minimal repro, copy/replay).
- [ ] 8 Governance — required-check policy-as-code now blocks missing/failed checks in preflight, with owner-scoped verification history; retention/region controls remain on top of the existing immutable audit log.
- [ ] 9 Local authoring companion — implement internal protocol and sideloadable extension; a publisher account is required only for marketplace publication.
- [x] 10 Model-agnostic gateway + comparison — per-task BYOK model/credential (existing) plus a Performance tab comparing quality/cost per model from real run records.

## Current verification hardening
- [x] Prevent successful QA cache entries from bypassing a failed budget.
- [x] Expose per-commit measured budget history in Changes, preserving unknown/stale evidence and blocking unmeasured required metrics.

## Recovery, verification-first and failure intelligence (authorized)
- [x] Recovery / replay: an interrupted run resumes with a brief of provably done vs unverified work, actions whose outcome is unknown, and the failing check to reproduce first — never a restart.
- [x] Verification-first: acceptance criteria first, cheapest-first ladder (typecheck → lint → unit → build → preview route → e2e) in the shared production rules, and a per-run evidence table (item | criteria | test run | result) built only from checks that really ran; a check that never ran is unverified.
- [x] Failure intelligence: every finished run records a post-run report (time, steps, rework ratio, human interventions, failure mode with evidence) and Settings → Performance aggregates top failure modes, rework, interventions and the prior-context rate per project from the owner's own runs.
- [ ] Evidence rows in the UI still need a run that executes the QA gate or a route probe in this project; the builders are tested against recorded gate/budget/policy/route shapes.
- [x] Reads survive a server restarting mid-request: aborted/500 responses retry up to three times with backoff, so approval, interaction and integration panels refill themselves instead of blanking until a manual refresh.

- [x] Run survives a dropped browser connection: a dead client stream no longer aborts the agent run; the page refetches saved progress (5 retries with backoff), follows a background run at 3s intervals, and resyncs on reconnect/refocus/reopen.
- [x] Mobile tab stays awake during a run: inaudible Web Audio loop + screen wake lock, re-acquired when the tab becomes visible again.
- [ ] Completion/approval alert is page-local only (browser Notification while the tab still lives in the background). Real web push — service worker, VAPID keys, server-side send on run finish or pending approval — is not built, so an alert cannot arrive once the OS kills the tab.

## Remaining platform work
- [ ] Snapshot/warm-start improvements using existing task compute only; do not introduce paid idle sandboxes.
- [ ] Canary matrix, baseline/post benchmarks, full end-to-end customer project verification and final release documentation.
- [ ] Publish the app (user go-ahead).

## v4.1 addendum (C18–C25)
- [x] C18 automatic rollback of failed releases, runtime stack → file:line, live response-time regression alerts
- [x] C19 docs_drift_check (stale paths/scripts/env vars)
- [x] C20 workspace_map + symbol index survives moves
- [x] C21 per-model minQualityScore deploy gate + maxRunCostUsd per-run cost record (forge.policy.json)
- [x] C22 OSV check on every package.json change + 90-day secret rotation reminder
- [x] C23 "Wrong?" on replies → saved correction
- [x] C24 cold-start runbook on brand-new repos
- [x] C25 build-failure triage with proposed fix
- [ ] Live verification of rollback / triage / perf on a real failing deploy (needs a real failed release)

## Phase-2 backlog (frozen by owner, 2026-11-03) — v4.2 C26–C32, not scheduled
- [ ] C26 prompt/session versioning
- [ ] C27 change provenance drill-down
- [ ] C28 stale-project health checks
- [ ] C29 visual annotation → source
- [ ] C30 plan-cost gating
- [ ] C31 platform self-test (dogfood)
- [ ] C32 deprecation discipline
