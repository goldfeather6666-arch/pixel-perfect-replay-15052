import type { PendingChange } from "./providers";
import { sandboxSyncCommand } from "./sandbox-sync";

const REPO_DIR = "/home/user/repo";
const MAX_OUT = 20000;

type Session = { id: string; user_id: string; repo: string; work_branch: string; sandbox_id?: string | null };

function clip(s: string) {
  return s.length > MAX_OUT ? s.slice(0, MAX_OUT / 2) + "\n...[output truncated]...\n" + s.slice(-MAX_OUT / 2) : s;
}

/** Opens (or reuses) this task's E2B sandbox, synced to the work branch plus staged changes. */
const JOB_CHUNK = 60_000;
/** Pass as `job` to runInSandbox to just open/sync the task sandbox and get the instance back. */
export const OPEN_ONLY = "__open_only__";
export async function openTaskBox(sb: any, session: Session, ghToken: string, pending: PendingChange[] = []) {
  return (await runInSandbox(sb, session, ghToken, "true", pending, undefined, undefined, OPEN_ONLY)) as unknown as { box: import("./runner-box.server").Box };
}

/** Reads new output of a detached terminal job from `offset` (bytes) and its exit code if finished. */
export async function pollJob(sandboxId: string, job: string, offset: number, kill = false) {
  if (!/^[a-z0-9-]{8,64}$/.test(job)) throw new Error("Invalid job");
  const { connectBox } = await import("./runner-box.server");
  const box = await connectBox(sandboxId, 15 * 60_000);
  if (!box) return { out: "", offset, exit_code: -1, done: true, note: "Sandbox expired (15 min idle). Run the command again." };
  const dir = `/tmp/forge-jobs/${job}`;
  if (kill) await box.commands.run(`p=$(cat ${dir}/pid 2>/dev/null); [ -n "$p" ] && pkill -TERM -P $p; pkill -f ${dir}/cmd.sh; kill $p 2>/dev/null; [ -f ${dir}/exit ] || echo 130 > ${dir}/exit`, { timeoutMs: 10_000 }).catch(() => {});
  const r = await box.commands.run(
    `s=$(stat -c%s ${dir}/out.log 2>/dev/null || echo 0); tail -c +${offset + 1} ${dir}/out.log 2>/dev/null | head -c ${JOB_CHUNK}; printf '\\036%s|%s' "$s" "$(cat ${dir}/exit 2>/dev/null)"`,
    { timeoutMs: 20_000 },
  ).catch(() => null);
  const raw = String(r?.stdout ?? "");
  const i = raw.lastIndexOf("\x1e");
  const [size, code] = (i >= 0 ? raw.slice(i + 1) : "0|").split("|");
  const total = Number(size) || 0;
  const next = Math.min(total, offset + JOB_CHUNK);
  const exit = code?.trim() ? Number(code.trim()) : null;
  return { out: i >= 0 ? raw.slice(0, i) : "", offset: next, exit_code: exit, done: exit !== null && next >= total };
}

/**
 * Owner opted in (agent_sessions.share_tokens): the task's own pinned GitHub/Vercel/database tokens
 * become env vars for agent shell commands only (gh, vercel, supabase CLIs). Never written to repo,
 * logs or preview; resolved fresh per command so turning sharing off takes effect immediately.
 */
export async function sharedTokenEnv(sb: any, session: Session, ghToken: string): Promise<Record<string, string>> {
  const { data } = await sb.from("agent_sessions").select("share_tokens, accounts").eq("id", session.id).eq("user_id", session.user_id).maybeSingle();
  if (!data?.share_tokens) return {};
  const { accountToken } = await import("./accounts.server");
  const [vercel, supa] = await Promise.all([
    accountToken(sb, session.user_id, "vercel", data.accounts).catch(() => null),
    accountToken(sb, session.user_id, "supabase", data.accounts).catch(() => null),
  ]);
  const env: Record<string, string> = {};
  if (ghToken) { env["GH_TOKEN"] = ghToken; env["GITHUB_TOKEN"] = ghToken; }
  if (vercel) env["VERCEL_TOKEN"] = vercel;
  if (supa) env["SUPABASE_ACCESS_TOKEN"] = supa;
  return env;
}

export async function runInSandbox(sb: any, session: Session, ghToken: string, command: string, pending: PendingChange[] = [], preview?: { port: number }, signal?: AbortSignal, job?: string) {
  signal?.throwIfAborted();
  const { connectBox, createBox } = await import("./runner-box.server");
  let box: import("./runner-box.server").Box | null = null;
  const cancel = () => {
    const active = box;
    if (!active) return;
    // Terminate actual shell work, not just our wait for its output.
    void active.kill().catch(() => {});
    void Promise.resolve(sb.from("agent_sessions").update({ sandbox_id: null }).eq("id", session.id).eq("user_id", session.user_id).eq("sandbox_id", active.sandboxId)).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
  if (session.sandbox_id) {
    box = await connectBox(session.sandbox_id, 15 * 60_000);
  }
  if (signal?.aborted) { cancel(); signal.throwIfAborted(); }
  // Token is passed per command as env only; never written to git config or disk.
  const auth = `AUTHORIZATION: basic ${btoa(`x-access-token:${ghToken}`)}`;
  const envs = { GH_AUTH: auth };
  if (!box) {
    // Private traffic: sandbox URLs need the traffic token, so previews are reachable only through Forge's gateway.
    // Owner's paired server first (free), E2B as fallback.
    box = await createBox(session.user_id, { timeoutMs: 15 * 60_000, metadata: { session: session.id }, privateTraffic: true });
    if (signal?.aborted) { cancel(); signal.throwIfAborted(); }
    // The base VM has ~470 MB RAM; add swap first so installs/builds don't crash out of memory.
    await box.commands.run(SWAP_CMD, { timeoutMs: 60_000 }).catch(() => {});
    const clone = await box.commands.run(
      `git -c http.extraHeader="$GH_AUTH" clone --branch ${JSON.stringify(session.work_branch)} --single-branch https://github.com/${session.repo}.git ${REPO_DIR}`,
      { envs, timeoutMs: 120_000 },
    ).catch((e: any) => e);
    if (clone?.exitCode !== 0) {
      await box.kill().catch(() => {});
      throw new Error("Could not clone the repository into the sandbox");
    }
    session.sandbox_id = box.sandboxId;
    await sb.from("agent_sessions").update({ sandbox_id: box.sandboxId }).eq("id", session.id).eq("user_id", session.user_id);
  } else {
    await box.setTimeout(15 * 60_000).catch(() => {});
    const synced = await box.commands.run(
      sandboxSyncCommand(REPO_DIR, session.work_branch),
      { envs, timeoutMs: 120_000 },
    ).catch(() => null);
    if (synced?.exitCode !== 0) throw new Error("Sandbox could not sync the current work branch. Checks were not run on stale code; retry the command.");
  }
  // Overlay staged (not yet approved) changes so commands see the agent's current work.
  signal?.throwIfAborted();
  for (const c of pending) {
    if (c.path.includes("..") || c.path.startsWith("/")) continue;
    const full = `${REPO_DIR}/${c.path}`;
    if (c.action === "delete") await box.files.remove(full).catch(() => {});
    else await box.files.write(full, c.content ?? "");
  }
  // New or reset sandbox: seed database settings + project secrets so agent commands match preview/Vercel.
  if (job !== OPEN_ONLY) {
    const has = await box.commands.run(`test -f /tmp/forge-task.env && test -f ${REPO_DIR}/.env.local`, { timeoutMs: 10_000 }).catch((e: any) => e);
    if (has?.exitCode !== 0) {
      const { seedTaskEnv } = await import("./preview-manager.server");
      await seedTaskEnv(box, session).catch(() => {});
    }
  }
  if (job === OPEN_ONLY) return { box } as never;
  const tokens = await sharedTokenEnv(sb, session, ghToken).catch(() => ({} as Record<string, string>));
  const cmdEnv = { ...RUN_ENV, ...tokens };
  if (job) {
    // Detached terminal job: output streams to a log file the client polls, so long commands
    // (installs, builds) never hit the request time limit.
    const dir = `/tmp/forge-jobs/${job}`;
    // Shared tokens go into a 600-mode file removed as soon as the job shell has read it (never on the command line).
    const tokLines = Object.entries(tokens).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`).join("\n");
    if (tokLines) { await box.files.write(`${dir}/tok.env`, tokLines); await box.commands.run(`chmod 600 ${dir}/tok.env`, { timeoutMs: 10_000 }).catch(() => {}); }
    await box.files.write(`${dir}/cmd.sh`, `[ -f /tmp/forge-task.env ] && . /tmp/forge-task.env\n[ -f ${dir}/tok.env ] && . ${dir}/tok.env && rm -f ${dir}/tok.env\n${command}`);
    const envStr = Object.entries(RUN_ENV).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
    const h = await box.commands.run(
      `${envStr} bash ${dir}/cmd.sh > ${dir}/out.log 2>&1; echo $? > ${dir}/exit`,
      { cwd: REPO_DIR, background: true, timeoutMs: 0 },
    );
    await box.files.write(`${dir}/pid`, String(h.pid));
    return { job, sandbox_id: box.sandboxId };
  }
  if (preview) {
    // Start a long-running dev server and expose its port through the sandbox's public HTTPS host.
    await box.commands.run(`nohup bash -lc ${JSON.stringify(command)} > /tmp/preview.log 2>&1 &`, { cwd: REPO_DIR, envs: RUN_ENV, timeoutMs: 15_000 }).catch(() => {});
    await box.commands.run(`for i in $(seq 1 45); do curl -s -o /dev/null localhost:${preview.port} && exit 0; sleep 2; done; exit 1`, { timeoutMs: 100_000 }).catch(() => {});
    const log = await box.commands.run("tail -c 3000 /tmp/preview.log", { timeoutMs: 10_000 }).catch(() => null);
    return { url: `https://${box.getHost(preview.port)}`, log: String(log?.stdout ?? ""), note: "Preview stays up while the sandbox is active (15 min idle)." };
  }
  const started = Date.now();
  // Agent commands see the same database settings as the preview, so login/data flows can be exercised.
  const r = await box.commands.run(`[ -f /tmp/forge-task.env ] && . /tmp/forge-task.env; ${command}`, { cwd: REPO_DIR, envs: cmdEnv, timeoutMs: CMD_TIMEOUT_MS }).catch((e: any) => e);
  signal?.throwIfAborted();
  const timedOut = typeof r?.exitCode !== "number" && Date.now() - started >= CMD_TIMEOUT_MS - 2000;
  return {
    exit_code: typeof r?.exitCode === "number" ? r.exitCode : -1,
    stdout: clip(String(r?.stdout ?? "")),
    stderr: clip(String(r?.stderr ?? r?.message ?? "")),
    ...(timedOut
      ? { note: `Command stopped after ${CMD_TIMEOUT_MS / 1000}s. For long jobs run it in the background (nohup … > /tmp/x.log 2>&1 &) and check the log with tail in a later command.` }
      : {}),
  };
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

const CMD_TIMEOUT_MS = 240_000;
const SWAP_CMD =
  "swapon --show 2>/dev/null | grep -q /swapfile || (sudo fallocate -l 3G /swapfile && sudo chmod 600 /swapfile && sudo mkswap -q /swapfile && sudo swapon /swapfile) >/dev/null 2>&1 || true";
// Sensible defaults for low-memory installs/builds; commands can still override them.
const RUN_ENV = {
  NODE_OPTIONS: "--max-old-space-size=2560",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_progress: "false",
  npm_config_maxsockets: "8",
  NEXT_TELEMETRY_DISABLED: "1",
};
