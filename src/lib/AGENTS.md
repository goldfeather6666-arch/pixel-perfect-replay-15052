# Library rules
- Read engine/AGENTS.md before engine edits. Why: scoped run and ownership contracts.
- Global RPC fetch inspects stale-manifest failures before deserialization and performs bounded document recovery without replaying requests; approval polls keep errors visible and never throw into page rendering. Why: restart recovery without duplicated external actions or blank chat.
- Prompt refinement verifies owner-scoped task and credential rows, uses that task’s BYOK model, streams with cancellation and never executes tools or saves drafts. Why: isolated billing, ownership and consent.