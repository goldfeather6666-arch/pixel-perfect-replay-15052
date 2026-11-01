---
name: customer-owned-deployment
description: Configure and deploy generated customer projects using their own GitHub, Supabase, Vercel and AI-provider accounts.
---

# Customer-owned deployment (BYO infrastructure)

## Ownership and account selection
- Resolve the active task's pinned GitHub, database and Vercel account IDs before provider operations.
- Confirm the connected provider account belongs to the current customer and that the selected project/repository matches the task.
- Multiple accounts are supported. Never silently choose the newest account if the task has an explicit pin; never use the platform operator's account or another customer's credentials.
- If a required connection is missing, report exactly which provider/account is missing and guide the customer through Connect. Do not fabricate credentials or claim a sync happened.

## Inspect generated project
- Detect framework, package manager, lockfile, Node/runtime version, monorepo root, build/install commands and deployment preset from actual repository files.
- Inspect imports and runtime boundaries to derive required environment variable names. Do not assume every project is Next.js or Vite.
- Reuse existing customer projects and repository links. Ask before creating a new project, relinking a repository, changing production domains or overwriting remote configuration.

## Environment configuration
- Fetch settings from the selected customer's authorized Supabase connection where available; otherwise request the missing value through the secure connection UI, never chat.
- Generate framework-specific aliases only where the app's code/build requires them.
- Browser variables may contain only publishable/anon credentials. Supabase service-role/secret keys, Vercel tokens and AI provider keys are server-only.
- Configure the selected Vercel project for development, preview and production as appropriate. Verify variable names and target scopes without logging values.
- Never commit .env, secrets, provider tokens, private keys or populated environment templates. Commit only safe blank examples.
- For Supabase, verify project URL, public key, project reference, auth redirect allow-list and migration status. Preserve existing auth URLs by merging required redirects; never remove customer entries.
- Apply migrations only through the authorized migration workflow and its approval rules. Never reset production or disable RLS to get a deployment green.

## Build, deploy and verify
1. Run Connect & Sync for the task-pinned customer services.
2. Verify repository-to-Vercel linkage, project identity, root directory, framework preset, build/install commands, runtime version and environment target scopes.
3. Run production preflight on the final source and lockfile.
4. Deploy only through the selected customer's authorized Vercel project and normal release consent.
5. Wait for the exact commit's deployment status. Require READY, then probe the deployed entry page and relevant application routes.
6. If build succeeds but runtime fails, inspect redacted runtime logs and route/network evidence. Repair the root cause in bounded rounds and redeploy only when useful and authorized.
7. Treat pending, stale, canceled, failed, quota-limited or inaccessible deployments as unverified. Never claim success based only on a successful build.

## Security
- Keep all customer credentials encrypted at rest and decrypted only server-side.
- Never expose credentials in generated browser code, public environment prefixes, browser storage, logs, chat, GitHub or preview URLs.
- Never cross customer/task boundaries, use a platform account as fallback, rotate credentials, overwrite customer projects or perform destructive operations without explicit authorization.

## Final report
Name the selected customer project (non-sensitive identifier only), commit, deployment state, runtime routes checked, exact verification results and remaining blockers. Distinguish preview success from production deployment success.
