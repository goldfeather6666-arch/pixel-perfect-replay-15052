# Engine rules
- Run lifecycle (agent_runs) changes only through engine_transition; lifecycle.ts must mirror public.engine_stage_allowed. Why: models and clients cannot set arbitrary states.
- Events append via engine_event with per-run seq allocated atomically; clients replay with an afterSeq cursor. Store milestones only, never tokens or raw tool output. Why: reconnect without duplicates or bloated tables.
- Recorder writes are queued and best-effort; recording failures are counted, never break a run. Why: observability must not cost user work.
- Final stage comes from finalStage() facts (stop, error, blocker, step cap, pending approvals); never COMPLETED just because the model replied.
- Stored errors/events pass redact(); categories come from classifyError. Why: no secrets in logs.
- Model capabilities come from model-registry.ts; unknown models are flagged, not assumed capable. One fallback only, before any tool ran, for provider/rate/timeout/network errors.
- Autonomy is enforced server-side in /api/agent via autonomy.ts; "supervised"/"autonomous" keep legacy meanings. MCP non-read-only actions always need approval at every level.
- Skills: matching/always-on/dependency skills load in full; others are listed and recorded when read_skill loads them.
