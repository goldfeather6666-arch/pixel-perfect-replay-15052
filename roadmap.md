# Roadmap — BYOK AI Coding Agent (Forge)

- [x] Phases 1–6: keys, GitHub, streaming agent, approvals, checkpoints, editor, PRs, skills, MCP (HTTP/SSE/OAuth/action approvals), E2B terminal
- [ ] OAuth acceptance — blocked: needs user's Notion consent + published check
- [ ] Local stdio MCP — skipped by user (mobile only)

## Claude-Code-quality round
- [x] 1. Plan mode (toggle, /plan, approve-plan button; write tools removed while planning)
- [x] 2. Test-and-fix loop (/test, system loop guidance, 50 steps)
- [x] 3. Smarter content search (regex, 400 files, skips vendored/build dirs)
- [x] 4. Long-conversation summarising
- [x] 5. Helper sub-agents
- [x] 6. Live app preview from sandbox
- [x] 7. Per-file accept/reject
- [x] 8. Token usage per task
- [x] 9. Slash commands + finish notification + image attachments
- [x] 10. Runs continue after tab close; progress saved each step; Stop works from any device
- [x] 11. Automatic model retries (3)
- [x] 12. Deep security scan reviewed; custom endpoints now public-HTTPS only
- [x] 13. Per-repo agent memory (save_memory tool, shown under Changes)
- [x] Supabase + Vercel sync per task (Deploy tab, apply_migrations, deploy_status auto-fix)
- [x] Import skills from any GitHub repo (Settings → Skills: paste a repo/folder link, pick SKILL.md or markdown files)
