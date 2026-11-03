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

## Remaining platform work
- [ ] Snapshot/warm-start improvements using existing task compute only; do not introduce paid idle sandboxes.
- [ ] Canary matrix, baseline/post benchmarks, full end-to-end customer project verification and final release documentation.
- [ ] Publish the app (user go-ahead).
