import type { PendingChange } from "./providers";
import { sandboxSyncCommand } from "./sandbox-sync";

const REPO_DIR = "/home/user/repo";
const MAX_OUT = 20000;

type Session = { id: string; user_id: string; repo: string; work_branch: string; sandbox_id?: string | null };

function clip(s: string) {
  return s.length > MAX_OUT ? s.slice(0, MAX_OUT / 2) + "\n...[output truncated]...\n" + s.slice(-MAX_OUT / 2) : s;
}

/** Opens (or reuses) this task's E2B sandbox, synced to the work branch plus staged changes. */
export async function runInSandbox(sb: any, session: Session, ghToken: string, command: string, pending: PendingChange[] = [], preview?: { port: number }, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const apiKey = process.env["E2B_API_KEY"];
  if (!apiKey) throw new Error("Terminal is not configured");
  const { Sandbox } = await import("e2b");
  let box: InstanceType<typeof Sandbox> | null = null;
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
    box = await Sandbox.connect(session.sandbox_id, { apiKey, timeoutMs: 15 * 60_000 }).catch(() => null);
  }
  if (signal?.aborted) { cancel(); signal.throwIfAborted(); }
  // Token is passed per command as env only; never written to git config or disk.
  const auth = `AUTHORIZATION: basic ${btoa(`x-access-token:${ghToken}`)}`;
  const envs = { GH_AUTH: auth };
  if (!box) {
    box = await Sandbox.create({ apiKey, timeoutMs: 15 * 60_000, metadata: { session: session.id } });
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
  if (preview) {
    // Start a long-running dev server and expose its port through the sandbox's public HTTPS host.
    await box.commands.run(`nohup bash -lc ${JSON.stringify(command)} > /tmp/preview.log 2>&1 &`, { cwd: REPO_DIR, envs: RUN_ENV, timeoutMs: 15_000 }).catch(() => {});
    await box.commands.run(`for i in $(seq 1 45); do curl -s -o /dev/null localhost:${preview.port} && exit 0; sleep 2; done; exit 1`, { timeoutMs: 100_000 }).catch(() => {});
    const log = await box.commands.run("tail -c 3000 /tmp/preview.log", { timeoutMs: 10_000 }).catch(() => null);
    return { url: `https://${box.getHost(preview.port)}`, log: String(log?.stdout ?? ""), note: "Preview stays up while the sandbox is active (15 min idle)." };
  }
  const started = Date.now();
  const r = await box.commands.run(command, { cwd: REPO_DIR, envs: RUN_ENV, timeoutMs: CMD_TIMEOUT_MS }).catch((e: any) => e);
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
