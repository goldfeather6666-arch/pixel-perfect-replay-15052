# Library rules
- Read engine/AGENTS.md before engine edits. Why: scoped run and ownership contracts.
- Prompt refinement verifies owner-scoped task and credential rows, uses that task’s BYOK model, streams with cancellation and never executes tools or saves drafts. Why: isolated billing, ownership and consent.