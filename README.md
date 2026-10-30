# Forge — open-source, bring-your-own-key AI coding agent

Forge is a browser-based coding agent. Each user brings their own AI provider key, connects GitHub, and delegates tasks to an agent that reads, searches and edits real repository files on its own branch.

## Features

- **BYOK providers:** OpenAI, Anthropic, Google Gemini, OpenRouter, any OpenAI-compatible endpoint (incl. Ollama). Keys are validated with the provider, AES-GCM encrypted at rest, and only ever decrypted on the server.
- **GitHub:** personal access token (`repo` scope). Each task gets a fresh `agent/<id>` branch; the base branch is never modified.
- **Agent tools:** `list_files`, `read_file`, `search_files`, `write_file`, `delete_file`, with streaming progress.
- **Modes:** *Supervised* stages every edit for approval with a diff; *Autonomous* commits as it works.
- **Checkpoints:** every agent commit is a checkpoint; rewind the task branch to any of them or undo everything.
- **Editor:** view and edit files in the browser, committing to the task branch.
- **Skills & project instructions:** reusable instructions per user, plus `AGENTS.md` / `CLAUDE.md` from the repo.
- **Pull requests:** open a PR from the task branch in one click.

- **External MCP tools:** connect public or bearer-token Streamable HTTP or SSE endpoints in Settings. Tokens are encrypted; tools are available through deferred discovery/invocation. Read-only calls execute directly. Opt in to action requests to expose other tools: every external action requires separate approval in the task's Changes tab, even in autonomous mode. Approval uses the saved exact arguments, expires after 30 minutes and executes at most once. Results are saved and supplied on the next agent turn. DeepWiki's official endpoint is included as a preset. Trust only servers you control or recognize: tool annotations are not a security guarantee.

Not yet available: sandboxed terminal / test execution, OAuth-only MCP servers, and local stdio transport (requires a local execution bridge). See `roadmap.md`.

## Stack

TanStack Start (React 19, Vite, TypeScript), Tailwind CSS v4, shadcn/ui, Vercel AI SDK, Supabase (Auth + Postgres with Row Level Security). Runs on Cloudflare Workers or any Node 20+ host.

## Self-hosting

1. Install: `bun install` (Node 20 LTS or newer also works).
2. Create a Supabase project and apply the SQL files in `drizzle/migrations/` in order.
3. Set environment variables:
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (server)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (browser)
   - `KEY_ENCRYPTION_SECRET` — a random string of 64+ characters. Losing it makes saved keys unreadable; rotating it requires users to re-enter keys.
4. Run `bun run dev`, or `bun run build` and deploy.

No platform AI key is required: all inference uses the user's own credentials.

## Security notes

- Keys never reach the browser after saving; only the last 4 characters are shown.
- All tables use RLS scoped to `auth.uid()`.
- Repository file contents are treated as data; the system prompt tells the model to ignore instructions found inside them.
- Checkpoint restore only accepts commits that belong to the task branch.

## License

MIT — see `LICENSE`.
