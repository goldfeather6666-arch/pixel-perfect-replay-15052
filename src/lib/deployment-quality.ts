export const productionPolicy = Object.freeze({
  buildMode: "production" as const,
  allowDemo: false,
  allowMockIntegrations: false,
  automaticProductionRelease: false,
});

/** Shared by planning, the master, specialists and repair briefs; never implies release consent. */
export const productionInstructions = `PRODUCTION-FIRST BUILD CONTRACT
1. Target: start every implementation in ${productionPolicy.buildMode} mode. Never deliver a demo, prototype, MVP, disposable first version or "upgrade it later" substitute. Implement the requested scope completely using durable production architecture; do not expand the scope with unrequested features. Incremental commits are allowed, but intermediate scaffolding is not a finished deliverable.
2. Inspect and plan: identify the real framework, runtime, app root, package manager, deployment target and existing task-pinned customer GitHub/database/Vercel connections before editing. These are BYO customer resources, not platform-owned defaults. Resolve account IDs and credentials for the current owner and task only; never fall back to the operator's account or another customer's connection. Reuse the selected project; ask before creating or relinking remote resources. Define acceptance criteria for preview, real user journeys and deployment before assigning exclusive specialist paths.
3. Implement real behavior: wire actual persistence, integrations and authorization from the outset. Never substitute fake API success, hardcoded users, mock authentication, placeholder business data or local-storage-only persistence for a requested shared database. Test fixtures may exist only in tests, never as production fallbacks. Missing access is a precise blocker, not permission to fabricate credentials or silently downgrade to a demo. Implement safe configuration validation and honest empty/loading/error states.
4. Configure securely: keep private keys server-only and encrypted in Forge; GitHub receives source, ordered migration files and blank environment templates, never secret values. Use existing Connect & sync and the current task's customer-pinned accounts to sync required environment settings and auth return URLs to that customer's selected Vercel project before deployment. Verify GitHub repository linkage, Vercel project ID, root directory, framework preset, build/install commands, runtime version and target scopes. Never configure the platform's own Vercel project as a substitute. Supabase env contract (use these exact names; do not invent aliases or ask the user to paste values when a linked database is available): browser/Next.js = NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (legacy-compatible NEXT_PUBLIC_SUPABASE_ANON_KEY); Vite = VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (legacy-compatible VITE_SUPABASE_ANON_KEY); server = SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (legacy-compatible SUPABASE_ANON_KEY). Forge syncs these aliases to production, preview and development. Also sync the known project ref as SUPABASE_PROJECT_ID, NEXT_PUBLIC_SUPABASE_PROJECT_ID and VITE_SUPABASE_PROJECT_ID for SDKs and generated clients that require it. Use only public/publishable keys in browser bundles; SUPABASE_SERVICE_ROLE_KEY is server-only and must never use a NEXT_PUBLIC_ or VITE_ prefix. If a build reports missing Supabase variables, first verify the task-pinned database/Vercel links and run Connect & sync/Auto-fix; do not add empty fallbacks, hardcode project URLs/keys, or claim the issue is fixed until the relevant deployment is rebuilt and runtime-probed. Schema changes require new migrations and the normal approval rules; never reset production data or bypass RLS/auth to make a build pass.
5. Verify: save all source and lockfile changes to the task branch, run deployment_preflight after final edits, fix meaningful failures and recheck changed acceptance criteria. Exercise real user journeys (including authenticated flows when relevant), not just an empty or signed-out page. For preview, verify install/start exit status, process readiness, HTTP response for the requested route, browser console errors, failed network requests and runtime logs; process-alive or HTTP below 500 alone is insufficient. Check preview readiness and deployment runtime errors separately. A preview is not proof of a production build or deployment. Missing access, skipped checks and resource limits remain explicitly unverified.
6. Release gate: production-ready code is not permission to publish. Preserve task autonomy, staged-change approvals and external-action consent; use only authorized linked projects. After authorized final commits, deploy_status must verify the exact current commit as READY with a PASSED runtime probe; also verify relevant live user journeys before claiming they work. Never flood builds after every edit. Repair source/config causes in bounded rounds; quota LIMITED means stop deployment retries, not success or permission to evade quota.
7. Handoff: state what was implemented, exact checks and user journeys verified, preview state, production deployment state and remaining blockers. Never describe blocked or partially verified work as production-ready. Keep routine work in collapsed activity, not chat.`;

export const deploymentSkill = {
  name: "deployment-safe-coding",
  instructions: `${productionInstructions}

FRAMEWORK AND DEPLOYMENT CHECKLIST
Build for the repository's actual framework and production target, not just its dev server.
Before editing, read package.json, its lockfile, framework config, Vercel config and relevant existing code. Preserve the package manager, framework, Node version, build command and monorepo root. Add every dependency you import and keep the lockfile consistent. Never hide errors with ignoreBuildErrors, disabled checks, blanket any, or SSR externalization.
For SSR frameworks, keep browser-only APIs and libraries out of server imports: dynamically load them after hydration. Keep secrets server-only. For TanStack Start use its existing file routes and server functions; do not substitute Next.js or React Router patterns. For Next.js respect server/client boundaries. Serverless/edge code must not depend on native binaries or subprocesses; execute commands only through Forge's sandbox.
Read a full file before replacing it. Create dependencies before their importers. Check exports, path aliases, route references, hooks (effects return only cleanup functions), required env variable NAMES without printing values, and runtime compatibility. Add focused behavior tests for changed rules.
Use deployment_preflight with phase=install once when dependencies are missing/changed, then phase=check after the FINAL edits. It runs existing lint, typecheck, non-watch tests and the production build, and reports real exit codes. Use root for the app directory in a monorepo. Sandbox edits are ephemeral: all fixes and changed lockfiles must be saved with write_file. Do not treat dev-server startup or a resource timeout as a successful build.
Fix the first meaningful compiler/test error, not downstream symptoms. Re-run checks after each fix. Do not reinstall for unrelated errors. If local verification is blocked by memory/time or missing environment, report that and use Vercel's actual build; never invent a passing result.
After the final commit on the customer's task-pinned Vercel project, use deploy_status and require READY for that exact commit plus a PASSED entry-page runtime check. Confirm the deployment belongs to the expected customer account/project and repository before reporting its URL. RUNTIME_ERROR means the build succeeded but the page failed: inspect runtime logs and required environment variable NAMES and server queries. Public catalog reads must use public/user clients with appropriate read policies, not require admin credentials or bypass authorization. Never invent credentials, expose secrets or disable access controls to make a page load. ERROR, CANCELED or UNVERIFIED is not success. Read the build log, correct the source/config, commit and re-check, up to three repair rounds. Pending, absent, stale or inaccessible deployments are unverified; explain the blocker. LIMITED means Vercel's daily deployment quota is used up: do not retry or work around it; finish local checks and tell the user. In supervised mode, verify staged files locally but wait for user approval before deployment or database changes.
Sign-in must work on the live site: build return/redirect links from the current origin (window.location.origin), never hardcode localhost; sign-out must clear the session, clear cached private data and return to the sign-in page; protected pages must handle a missing session without crashing; SSR code must not assume a browser session. Forge syncs the database sign-in return links to the Vercel domains; if login/logout fails, check redirect URLs and session handling in code.
Final response: summarize changes, exact checks passed/failed/skipped, deployment state and any next action. Keep routine narration in activity, not chat.`,
};

export function preflightCommand(phase: "install" | "check", root = ".") {
  if (!/^(\.|[A-Za-z0-9_@-]+(?:\/[A-Za-z0-9_.@-]+)*)$/.test(root) || root.split("/").includes("..")) {
    throw new Error("Use a relative app directory without parent traversal.");
  }
  const script = String.raw`
const fs = require('fs');
const cp = require('child_process');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const declared = (pkg.packageManager || '').split('@')[0];
const locks = [['pnpm','pnpm-lock.yaml'],['yarn','yarn.lock'],['bun','bun.lock'],['bun','bun.lockb'],['npm','package-lock.json']];
const pm = declared || (locks.find(([, file]) => fs.existsSync(file)) || ['npm'])[0];
if (!['npm','pnpm','yarn','bun'].includes(pm)) throw new Error('Unsupported package manager: ' + pm);
const run = (args) => {
  console.log('\n[Forge check] ' + pm + ' ' + args.join(' '));
  const result = cp.spawnSync(pm, args, { stdio:'inherit', env:{...process.env, CI:'true'}, timeout:210000 });
  if (result.error) { console.error(result.error.message); return 1; }
  console.log('[Forge exit] ' + result.status);
  return result.status === 0 ? 0 : 1;
};
if (PHASE === 'install') {
  const args = pm === 'npm' ? (fs.existsSync('package-lock.json') ? ['ci'] : ['install']) : ['install', '--frozen-lockfile'];
  process.exit(run(args));
}
let failed = false;
const scripts = pkg.scripts || {};
for (const name of ['lint', 'typecheck', 'type-check', 'check-types', 'test', 'build']) {
  if (!scripts[name]) { if (name === 'build') { console.error('Production build script missing; verification blocked.'); failed = true; } continue; }
  if (name === 'test' && (/--watch\b|vitest\s*$|jest\s*$/.test(scripts[name]))) {
    const args = /vitest/.test(scripts[name]) ? ['run','test','--','run'] : ['run','test','--','--watch=false'];
    failed = run(args) !== 0 || failed;
  } else if (name === 'test' && /react-scripts test/.test(scripts[name])) {
    failed = run(['run','test','--','--watchAll=false']) !== 0 || failed;
  } else { failed = run(['run', name]) !== 0 || failed; }
  if (failed) break;
}
process.exit(failed ? 1 : 0);
`.replace("PHASE", JSON.stringify(phase));
  // This script executes inside E2B, never inside the web application's server runtime.
  return `cd '${root}' && node -e '${script.replace(/'/g, "'\\''")}'`;
}

export type CheckResult = { exit_code?: number; stdout?: string; stderr?: string; error?: string; note?: string };

// Keep file paths and compiler messages, strip anything that could carry a credential.
function sanitizeLine(line: string): string {
  return line
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[redacted]") // JWTs
    .replace(/\b(?:sk|pk|key|token|secret|password|apikey|api_key|bearer)[-_]?[A-Za-z0-9_-]{16,}\b/gi, "[redacted]")
    .replace(/(key|token|secret|password|apikey)(["'\s]*[:=]["'\s]*)\S+/gi, "$1$2[redacted]")
    .replace(/https?:\/\/[^\s)"']*@/g, "https://[redacted]@") // credentialed URLs
    .slice(0, 220)
    .trim();
}

// Pull the first meaningful error lines so the user and the agent see the real cause,
// not just "read the output". Only error-looking lines are included, then sanitized.
export function firstErrorLines(output: string, max = 3): string[] {
  const lines = output.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !/\[Forge (check|exit)\]/.test(l));
  const matches = lines.filter((l) => /error|failed|✕|✗|not found|cannot find|missing/i.test(l));
  const picked = (matches.length ? matches : lines.slice(-max)).slice(0, max);
  return picked.map(sanitizeLine).filter(Boolean);
}

// Return fixed diagnostic categories plus sanitized first-error lines; never raw dumps that may contain credentials.
export function checkFailure(result: CheckResult): string {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error ?? ""}\n${result.note ?? ""}`;
  if (/URL and Key are required|supabaseUrl is required|supabaseKey is required|missing.*(?:environment variable|SUPABASE.*KEY|SUPABASE.*URL)/i.test(output)) return "Required database URL/public-key settings are missing in the check environment. Connect the database in Deploy and verify the current commit on Vercel; never invent credentials.";
  if (/deadline_exceeded|timed out|Command stopped after|ETIMEDOUT/i.test(output)) return "The sandbox command timed out; production checks did not finish. Verify the current commit on Vercel instead of repeating the same timed-out command.";
  if (/out of memory|heap limit|ENOMEM|Killed/i.test(output)) return "The sandbox ran out of memory. Verify the current commit on Vercel instead of repeating the same resource-blocked check.";
  if (/Terminal.*not configured/i.test(output)) return "The terminal is not configured. Connect it or verify the current commit on Vercel.";
  if (/Production build script missing/i.test(output)) return "The repository has no production build script. Add the correct build command before verification.";
  const checks = [...output.matchAll(/\[Forge check\] (?:npm|pnpm|yarn|bun) run (lint|typecheck|type-check|check-types|test|build)\b/g)];
  const phase = checks.at(-1)?.[1];
  const first = firstErrorLines(output);
  const detail = first.length ? ` First error: ${first.join(" — ")}` : "";
  return phase
    ? `The ${phase} check failed (exit ${result.exit_code ?? "unknown"}).${detail} Fix the first error and run production checks again.`
    : `Production checks failed (exit ${result.exit_code ?? "unknown"}).${detail}`;
}

export type QualityState = { changed: boolean; localPassed: boolean; localAttempted?: boolean; localIssue?: string | undefined; linked: boolean; supervised: boolean; deploymentState?: string | undefined };
export function needsFinalCheck(state: QualityState): boolean {
  return state.changed && !state.localPassed && !state.localAttempted && state.deploymentState !== "READY";
}
export function qualityBlocker(state: QualityState): string | null {
  if (!state.changed) return null;
  if (!state.localPassed && state.deploymentState !== "READY") return state.localIssue ?? "Current changes have not passed production checks. Run deployment_preflight, fix the reported errors and re-check; if the sandbox is resource-blocked, verify the exact commit through Vercel instead.";
  // LIMITED = Vercel refused to build because the account's deployment quota is used up; retrying can't help.
  if (state.linked && !state.supervised && state.deploymentState !== "READY" && state.deploymentState !== "LIMITED") return "The current commit is not verified READY on Vercel. Call deploy_status, read the actual build log and fix any failure. Do not report a completed deployment while it is failed, pending or missing.";
  return null;
}