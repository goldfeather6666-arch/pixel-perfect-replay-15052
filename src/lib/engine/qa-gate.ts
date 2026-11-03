// QA gate report: turns the preflight check log into measured per-step results
// and classifies failures so the agent fixes code regressions, retries flakes,
// and reports configuration problems instead of "fixing" code that is fine.

export type GateStep = { name: string; command: string; exit: number | null; durationMs: number | null };
export type FailureKind = "regression" | "flaky" | "config";
export type GateReport = {
  passed: boolean;
  steps: GateStep[];
  totalMs: number;
  failedStep?: string;
  failureKind?: FailureKind;
  summary: string;
};

const FLAKY = /\b(ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|timed? ?out|Timeout of \d+ms exceeded|net::ERR_|503 Service Unavailable|429 Too Many Requests|ENOSPC|out of memory|SIGKILL)\b/i;
const CONFIG = /(Missing script|command not found|Cannot find module '[^.\/]|Unsupported package manager|ERR_PNPM_|lockfile|Production build script missing|Environment variable .* (is )?(missing|required)|env(ironment)? var|ENOENT: no such file or directory, open '.*package\.json'|Invalid configuration|tsconfig)/i;

export function classifyFailure(log: string): FailureKind {
  if (CONFIG.test(log)) return "config";
  if (FLAKY.test(log)) return "flaky";
  return "regression";
}

/** Parse "[Forge check] pm run X" … "[Forge exit] N 1234ms" blocks from the check output. */
export function parseGateLog(stdout: string, stderr = ""): GateReport {
  const steps: GateStep[] = [];
  const lines = stdout.split("\n");
  let current: GateStep | null = null;
  let failLog = "";
  for (const line of lines) {
    const start = line.match(/^\[Forge check\] (\S+) (.+)$/);
    if (start) {
      const args = start[2]!.trim();
      const name = args.replace(/^run\s+/, "").split(/\s+/)[0] || args;
      current = { name, command: `${start[1]} ${args}`, exit: null, durationMs: null };
      steps.push(current);
      failLog = "";
      continue;
    }
    const end = line.match(/^\[Forge exit\] (\S+)(?: (\d+)ms)?/);
    if (end && current) {
      const code = Number(end[1]);
      current.exit = Number.isFinite(code) ? code : 1;
      current.durationMs = end[2] ? Number(end[2]) : null;
      if (current.exit !== 0) break;
      current = null;
      continue;
    }
    if (current) failLog += line + "\n";
  }
  const failed = steps.find((s) => s.exit !== 0);
  const totalMs = steps.reduce((n, s) => n + (s.durationMs ?? 0), 0);
  const passed = steps.length > 0 && !failed;
  const failureKind = failed ? classifyFailure(failLog + "\n" + stderr) : !steps.length ? classifyFailure(stdout + "\n" + stderr) : undefined;
  const fmt = (ms: number | null) => (ms == null ? "?" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
  const summary = passed
    ? `QA gate passed: ${steps.map((s) => `${s.name} ${fmt(s.durationMs)}`).join(", ")} (total ${fmt(totalMs)}).`
    : failed
      ? `QA gate failed at ${failed.name} (exit ${failed.exit}, ${fmt(failed.durationMs)}); kind: ${failureKind}. ${HINT[failureKind!]}`
      : `QA gate did not run any step; kind: ${failureKind}. ${HINT[failureKind!]}`;
  return { passed, steps, totalMs, ...(failed ? { failedStep: failed.name } : {}), ...(failureKind ? { failureKind } : {}), summary };
}

const HINT: Record<FailureKind, string> = {
  regression: "Fix the code error shown, then rerun the gate.",
  flaky: "Looks transient (network/timeout); rerun once before changing code.",
  config: "Configuration or setup problem (scripts, lockfile, env); fix setup rather than app code.",
};
