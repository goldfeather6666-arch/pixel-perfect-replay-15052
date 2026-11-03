# Forge — Project State
Version: 1 · Updated: 2026-11-03 20:20 UTC

## Current phase
Workflow hardening (env/secret guards, state tracking).

## Environment facts [verified 2026-11-03, shell]
- Node v22.23.4, bun 1.4.4. `engines.node >=22` set in package.json.
- Package manager is bun; lockfile is `bun.lock` (tracked). There is no `web/` folder and no package-lock.json.
- Tests: `./node_modules/.bin/vitest run` → 692 passed.
- CI: `.github/workflows/quality.yml` (frozen-lockfile install, typecheck, tests, build) and `secret-scan.yml` (env guard + gitleaks full history).

## Done / verified
- env guard script `scripts/env-guard.sh` — tracked mode passes on this repo [verified]. Staged-mode rejection of a bad file [UNVERIFIED: sandbox blocks git add].
- Pre-commit hook `.githooks/pre-commit` — needs `git config core.hooksPath .githooks` per clone.
- Git history check: committed `.env` only ever held public keys (Supabase URL/project ID/publishable key). No commit `b53ce3a` and no `VAULT_KEY` in history [verified, git log].

## Open decisions / blockers
- Connection resilience (2026-11-03): agent run is no longer tied to the browser stream — a dead client write is swallowed instead of aborting the run; the workspace refetches saved progress and follows a background run; mobile keep-alive (wake lock + inaudible audio loop) is always-on during runs [verified: code read, build OK]. Completion alerts are page-local Notifications only; real web push (service worker + VAPID + server send) is NOT built [verified: no serviceWorker/PushManager/VAPID anywhere in src].
- Vault key rotation (commit b53ce3a): that commit is not in this repository. If it lives in another repo, rotate there and set the new value as a server-side secret on the deploy target.
- gitleaks first CI run unverified (runs on GitHub only).

## Scope decision (2026-11-03)
- C26–C32 frozen as a phase-2 backlog by the owner. No new C-items get folded in; new ideas go to that backlog.
- 2026-11-03: Real web push for run finished/failed/needs-input. Verified: encryption round-trip test + typecheck. Unverified: delivery to a real phone.
