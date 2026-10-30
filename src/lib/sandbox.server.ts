import type { PendingChange } from "./providers";

const REPO_DIR = "/home/user/repo";
const MAX_OUT = 20000;

type Session = { id: string; user_id: string; repo: string; work_branch: string; sandbox_id?: string | null };

function clip(s: string) {
  return s.length > MAX_OUT ? s.slice(0, MAX_OUT / 2) + "\n...[output truncated]...\n" + s.slice(-MAX_OUT / 2) : s;
}

/** Opens (or reuses) this task's E2B sandbox, synced to the work branch plus staged changes. */
export async function runInSandbox(sb: any, session: Session, ghToken: string, command: string, pending: PendingChange[] = [], preview?: { port: number }) {
  const apiKey = process.env["E2B_API_KEY"];
  if (!apiKey) throw new Error("Terminal is not configured");
  const { Sandbox } = await import("e2b");
  let box: InstanceType<typeof Sandbox> | null = null;
  if (session.sandbox_id) {
    box = await Sandbox.connect(session.sandbox_id, { apiKey, timeoutMs: 15 * 60_000 }).catch(() => null);
  }
  // Token is passed per command as env only; never written to git config or disk.
  const auth = `AUTHORIZATION: basic ${btoa(`x-access-token:${ghToken}`)}`;
  const envs = { GH_AUTH: auth };
  if (!box) {
    box = await Sandbox.create({ apiKey, timeoutMs: 15 * 60_000, metadata: { session: session.id } });
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
    await box.commands.run(
      `cd ${REPO_DIR} && git -c http.extraHeader="$GH_AUTH" fetch -q origin ${JSON.stringify(session.work_branch)} && git reset -q --hard FETCH_HEAD`,
      { envs, timeoutMs: 120_000 },
    ).catch(() => {});
  }
  // Overlay staged (not yet approved) changes so commands see the agent's current work.
  for (const c of pending) {
    if (c.path.includes("..") || c.path.startsWith("/")) continue;
    const full = `${REPO_DIR}/${c.path}`;
    if (c.action === "delete") await box.files.remove(full).catch(() => {});
    else await box.files.write(full, c.content ?? "");
  }
  if (preview) {
    // Start a long-running dev server and expose its port through the sandbox's public HTTPS host.
    await box.commands.run(`nohup bash -lc ${JSON.stringify(command)} > /tmp/preview.log 2>&1 &`, { cwd: REPO_DIR, timeoutMs: 15_000 }).catch(() => {});
    await box.commands.run(`for i in $(seq 1 45); do curl -s -o /dev/null localhost:${preview.port} && exit 0; sleep 2; done; exit 1`, { timeoutMs: 100_000 }).catch(() => {});
    const log = await box.commands.run("tail -c 3000 /tmp/preview.log", { timeoutMs: 10_000 }).catch(() => null);
    return { url: `https://${box.getHost(preview.port)}`, log: String(log?.stdout ?? ""), note: "Preview stays up while the sandbox is active (15 min idle)." };
  }
  const r = await box.commands.run(command, { cwd: REPO_DIR, timeoutMs: 180_000 }).catch((e: any) => e);
  return {
    exit_code: typeof r?.exitCode === "number" ? r.exitCode : -1,
    stdout: clip(String(r?.stdout ?? "")),
    stderr: clip(String(r?.stderr ?? r?.message ?? "")),
  };
}
