export const deploymentSkill = {
  name: "deployment-safe-coding",
  instructions: `Build for the repository's actual framework and production target, not just its dev server.
Before editing, read package.json, its lockfile, framework config, Vercel config and relevant existing code. Preserve the package manager, framework, Node version, build command and monorepo root. Add every dependency you import and keep the lockfile consistent. Never hide errors with ignoreBuildErrors, disabled checks, blanket any, or SSR externalization.
For SSR frameworks, keep browser-only APIs and libraries out of server imports: dynamically load them after hydration. Keep secrets server-only. For TanStack Start use its existing file routes and server functions; do not substitute Next.js or React Router patterns. For Next.js respect server/client boundaries. Serverless/edge code must not depend on native binaries or subprocesses; execute commands only through Forge's sandbox.
Read a full file before replacing it. Create dependencies before their importers. Check exports, path aliases, route references, hooks (effects return only cleanup functions), required env variable NAMES without printing values, and runtime compatibility. Add focused behavior tests for changed rules.
Use deployment_preflight with phase=install once when dependencies are missing/changed, then phase=check after the FINAL edits. It runs existing lint, typecheck, non-watch tests and the production build, and reports real exit codes. Use root for the app directory in a monorepo. Sandbox edits are ephemeral: all fixes and changed lockfiles must be saved with write_file. Do not treat dev-server startup or a resource timeout as a successful build.
Fix the first meaningful compiler/test error, not downstream symptoms. Re-run checks after each fix. Do not reinstall for unrelated errors. If local verification is blocked by memory/time or missing environment, report that and use Vercel's actual build; never invent a passing result.
After the final commit on a linked Vercel project, use deploy_status and require READY for that exact commit. ERROR or CANCELED is not success. Read the build log, correct the source/config, commit and re-check, up to three repair rounds. Pending, absent, stale or inaccessible deployments are unverified; explain the blocker. In supervised mode, verify staged files locally but wait for user approval before deployment or database changes.
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

export type QualityState = { changed: boolean; localPassed: boolean; linked: boolean; supervised: boolean; deploymentState?: string };
export function qualityBlocker(state: QualityState): string | null {
  if (!state.changed) return null;
  if (!state.localPassed && state.deploymentState !== "READY") return "Current changes have not passed production checks. Run deployment_preflight, fix the reported errors and re-check; if the sandbox is resource-blocked, verify the exact commit through Vercel instead.";
  if (state.linked && !state.supervised && state.deploymentState !== "READY") return "The current commit is not verified READY on Vercel. Call deploy_status, read the actual build log and fix any failure. Do not report a completed deployment while it is failed, pending or missing.";
  return null;
}