# Universal Agent Foundation rollout
- [x] Step 1: Constitution, instruction hierarchy, completion vocabulary, task spec & sizing
- [x] Step 2: Prompt library A–M and 7-layer prompt assembly
- [x] Step 3: Tool broker (risk classes, side-effect state, idempotency)
- [x] Step 4: Delegation contracts and 6-tier memory
- [x] Step 5: Evaluation suite, hard gates, chat outcome badges

# Env sync + agent deploy
- [x] Sync DB settings, APP_URL and project secrets to Vercel on every sync
- [x] Seed env into every task sandbox (.env.local + /tmp/forge-task.env), never committed
- [x] Agent can deploy and review live Vercel build when the user asks

# Redesign + preview database
- [x] Preview/sandbox auto-find the task database; agent list_databases/link_database tools
- [x] Calm header with account menu; slim workspace bar and single-card chat box
- [x] New landing page
- [ ] Deeper dashboard, settings and skills page redesign (next pass)
