# Forge roadmap

## Add-ons (authorized scope)
- [x] 1 Creative Director — `quality_score` tool scores the served HTML (contrast, headings, labels, alt, targets, metadata, measured LCP/payload) with blocker/major caps; `remember_style` tool + `style_memory` table record the project's palette/typefaces/radii/tokens and inject them into later tasks.
- [ ] 1b Auto-tag pages as agent-authored vs human-edited (needs commit-author classification + Changes display).
- [ ] 2 Public share links + demo gallery (needs a decision on what may be publicly exposed; read-only expiring tokens).
- [x] 3 Prompt audit — `change_provenance` records prompt→path→run; "Why" dialog shows prompt, QA evidence and acceptance criteria per file.
- [ ] 4 Ambient idle mode — opt-in maintenance (dep audit, dead code, security scan) producing reviewable recommended patches.
- [ ] 5 Review badges + role approvals + Slack/Teams notices — needs a Slack app or incoming webhook from the user to activate.
- [x] 6 Budget-as-code — `budget.json` validated, payloads measured in the QA gate, breaches block handoff with fixes.
- [x] 7 Bug autopsy — repro artifact card (environment, redacted evidence, changed files, minimal repro, copy/replay).
- [ ] 8 Governance — policy-as-code checks + retention/region controls on top of the existing immutable audit log.
- [ ] 9 Local authoring companion — needs a VS Code extension publisher account; internal sync protocol can be built first.
- [x] 10 Model-agnostic gateway + comparison — per-task BYOK model/credential (existing) plus a Performance tab comparing quality/cost per model from real run records.

## Remaining platform work
- [ ] Warm idle sandboxes (paid compute — user decision).
- [ ] Publish the app (user go-ahead).
