# Roadmap — BYOK AI Coding Agent (Forge)

- [x] Phases 1–6: keys, GitHub, streaming agent, approvals, checkpoints, editor, PRs, skills, MCP (HTTP/SSE/OAuth/action approvals), E2B terminal
- [ ] OAuth acceptance — blocked: needs user's Notion consent + published check
- [ ] Local stdio MCP — skipped by user (mobile only)

## Claude-Code-quality round
- [x] 1. Plan mode (toggle, /plan, approve-plan button; write tools removed while planning)
- [x] 2. Test-and-fix loop (/test, system loop guidance, 50 steps)
- [x] 3. Smarter content search (regex, 400 files, skips vendored/build dirs)
- [x] 4. Long-conversation summarising
- [ ] 5. Helper sub-agents
- [ ] 6. Live app preview from sandbox
- [x] 7. Per-file accept/reject
- [x] 8. Token usage per task
- [x] 9. Slash commands + finish notification (image attachments still open)
- [ ] 10. Background tasks surviving tab close
- [x] 11. Automatic model retries (3)
- [ ] 12. Full security scan
