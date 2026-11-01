# Forge reorganisation + one-click connect & auto-fix

## Goals
Simple by default, powerful when needed. Three things up front in every task: **Chat, Preview, Deploy**. Everything else sits under **More**. One guided "Connect" flow links GitHub + database + Vercel and keeps them in sync, and one **Auto-fix** button repairs deploy and sign-in problems.

## 1. Home & task list
- One clean home page: a large "What do you want to build?" box at the top (choose repo, or a new repo, inline), with quick-start presets under it.
- Task list as cards with a clear status: Running in cloud / Needs you / Live / Failed / Done, plus the project's site link once it's live.
- A setup-health strip at the top: "AI key ✓ · GitHub ✓ · Database ⚠ · Vercel ✓", which opens Connect.
- Filters reduced to: All · Running · Needs you · Done.

## 2. Inside a task
- Desktop: the chat on the left and one right-hand panel with tabs **Preview | Deploy | Changes | More ▾** (Swarm, Run timeline, Knowledge, Terminal, Files).
- Mobile: a bottom bar with **Chat · Preview · Deploy · More** only (it has 8 items today).
- Header: task name, a status pill with a real timer, the model switcher, Stop, and **Auto-fix**.
- Remove duplicate notices: just one status banner at a time.

## 3. Settings & setup
- Settings gets three sections: **AI models**, **Accounts** (GitHub, database, Vercel, several allowed, each with a health check), **Tools & skills** (external tools, skills, diagnostics).
- A new **Connect wizard** (one screen, three steps with ticks) can be opened from home, a task, or Settings.

## 4. Connect & sync everything (fixes for deploy and sign-in)
When a project has GitHub + database + Vercel, one "Connect & sync" action:
1. Links the Vercel project to the GitHub repo.
2. Saves the database URL and public key (fetched automatically when the token allows; otherwise one paste box) and pushes them to Vercel production, preview and development.
3. **Fixes sign-in on live sites:** sets the database sign-in settings (the site address and the allowed return links) to the Vercel domains, including previews (`https://*.vercel.app`) and localhost. This is the usual reason login/logout breaks after a deploy passes.
4. Applies pending database migrations.
5. Runs a health check: build state, homepage response, a sign-in page probe, and checks that settings are present. The result is shown as a single checklist.
The sync runs again automatically after linking or changing accounts, and before each deploy check.

## 5. One-click Auto-fix
An **Auto-fix** button (task header + Deploy tab) does the following:
- Runs Connect & sync (step 4) first; most failures there are fixed without the AI.
- Collects the real blockers: build log errors, a crashed live page, missing settings, sign-in setting gaps, preview errors.
- Starts an agent run with a focused repair brief (deployment-safe-coding skill, preflight, up to 3 repair rounds), which runs in the cloud and shows progress in the same status pill.
- Ends with a clear result: "Live and working", or the one remaining blocker in plain words.

## 6. Error fixes included
- The agent always runs the deployment preflight before finishing, and treats a sign-in setting mismatch as a blocker.
- The deployment-safe-coding skill gets sign-in rules (correct return links, sign-out clears the session, server-only keys never in browser code).
- Fewer repeated "Continue" or "Verification incomplete" panels: a single result card.

## Technical details
- New `src/lib/connect.server.ts`: `syncProject()` orchestrating Vercel git link, env sync, the auth config PATCH (`/v1/projects/{ref}/config/auth`: `site_url`, `uri_allow_list`), migrations and a health probe; `connect.functions.ts` exposes `syncProject` and `projectHealth`.
- New `autoFix` server function: syncs, builds the blocker list, then starts a background run with a generated prompt (reusing /api/agent-background).
- New components: `ConnectWizard`, `HealthChecklist`, `AutoFixButton`, `MoreMenu`; restructure `app.tsx`, `s.$id.tsx` and `settings.tsx`; the existing panels are reused, not rewritten.
- Tests: auth allow-list building, health classification, blocker extraction.
- Each phase is checked with Playwright on phone and desktop sizes.

## Order
Phase A: Connect & sync + Auto-fix (the fixes). Phase B: the inside of a task. Phase C: home. Phase D: Settings.
