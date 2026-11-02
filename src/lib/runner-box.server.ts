// E2B-compatible workspace adapter. Workspaces run on the owner's paired runner when healthy,
// falling back to E2B. Callers use the same small surface (commands/files/kill/getHost/...).
import { isRunnerBoxId, parseRunnerBoxId, runnerBoxId, runnerUsable, signRequest } from "./runner-protocol";
import { COOLDOWN_MS, e2bKeysFrom, isQuotaError, keyOrder } from "./e2b-pool";

type RunOpts = { cwd?: string; envs?: Record<string, string>; timeoutMs?: number; background?: boolean };
export type CommandResult = { exitCode: number; stdout: string; stderr: string; pid?: number };
export type Box = {
  sandboxId: string;
  trafficAccessToken?: string | null;
  commands: { run(cmd: string, opts?: RunOpts): Promise<CommandResult> };
  files: { write(path: string, content: string): Promise<unknown>; remove(path: string): Promise<unknown>; read(path: string): Promise<string> };
  kill(): Promise<unknown>;
  setTimeout(ms: number): Promise<unknown>;
  getHost(port: number): string;
};

type RunnerRow = { id: string; user_id: string; key_id: string; endpoint: string; ciphertext: string; iv: string; status: string; last_seen: string | null; capacity: { free_slots?: number } | null };

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function secretOf(row: RunnerRow) {
  const { decryptSecret } = await import("./crypto.server");
  return decryptSecret(row.ciphertext, row.iv);
}

export async function runnerCall(endpoint: string, secret: string, method: string, path: string, body: unknown, timeoutMs = 60_000) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const { ts, signature } = await signRequest(secret, method, path, payload);
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-forge-ts": ts, "x-forge-signature": signature },
    body: method === "GET" ? null : payload,
    redirect: "manual",
    signal: AbortSignal.timeout(Math.max(5_000, timeoutMs + 10_000)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Your server refused the request (${res.status})`);
  return text ? JSON.parse(text) : {};
}

class RunnerBox implements Box {
  constructor(private endpoint: string, private secret: string, private box: string, keyId: string, public trafficAccessToken: string | null = null) {
    this.sandboxId = runnerBoxId(keyId, box);
    this.host = new URL(endpoint).host;
  }
  sandboxId: string;
  private host: string;
  private call(path: string, body: unknown, timeoutMs?: number) {
    return runnerCall(this.endpoint, this.secret, "POST", `/v1/boxes/${this.box}${path}`, body, timeoutMs);
  }
  commands = {
    run: async (cmd: string, opts: RunOpts = {}) => {
      const r = await this.call("/exec", { cmd, cwd: opts.cwd, envs: opts.envs, timeoutMs: opts.timeoutMs ?? 60_000, background: !!opts.background }, opts.timeoutMs || 60_000);
      const out = { exitCode: Number(r.exitCode ?? -1), stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? ""), pid: r.pid };
      if (!opts.background && out.exitCode !== 0) throw Object.assign(new Error(out.stderr || `exit ${out.exitCode}`), out);
      return out;
    },
  };
  files = {
    write: (path: string, content: string) => this.call("/files/write", { path, content }),
    remove: (path: string) => this.call("/files/remove", { path }),
    read: async (path: string) => String((await this.call("/files/read", { path })).content ?? ""),
  };
  kill() { return runnerCall(this.endpoint, this.secret, "POST", `/v1/boxes/${this.box}/destroy`, {}); }
  setTimeout(ms: number) { return this.call("/touch", { ttlMs: ms }); }
  /** Path-scoped upstream: the preview gateway appends the request path to this host string. */
  getHost(port: number) { return `${this.host}/__preview/${this.box}/${port}`; }
}

/** The owner's own paired server, else the platform-wide shared server (FORGE_SHARED_RUNNER_OWNER). */
async function runnerFor(userId: string): Promise<RunnerRow | null> {
  const db = await admin();
  const { data } = await db.from("owner_runners").select("*").eq("user_id", userId).maybeSingle();
  const own = (data as RunnerRow | null) ?? null;
  if (own && runnerUsable(own)) return own;
  const shared = process.env["FORGE_SHARED_RUNNER_OWNER"]?.trim();
  if (shared && shared !== userId) {
    const { data: s } = await db.from("owner_runners").select("*").eq("user_id", shared).maybeSingle();
    if (s) return s as RunnerRow;
  }
  return own;
}

// ---- E2B account pool (several free accounts rotated; quota failures cool a key for 15 min) ----
let cursor = 0;
const coolingUntil = new Map<string, number>();
const e2bKeys = () => e2bKeysFrom(process.env as Record<string, string | undefined>);
import { hasE2b } from "./e2b-pool";
export { hasE2b };

async function createE2b(opts: { timeoutMs: number; metadata: Record<string, string>; privateTraffic?: boolean }) {
  const keys = e2bKeys();
  if (!keys.length) throw new Error("Workspaces are not configured: pair your own server in Settings or add an E2B key.");
  const { Sandbox } = await import("e2b");
  const order = keyOrder(keys.length, cursor, (i) => (coolingUntil.get(keys[i]!) ?? 0) > Date.now());
  let last: unknown;
  for (const i of order) {
    const key = keys[i]!;
    try {
      const box = await Sandbox.create({ apiKey: key, timeoutMs: opts.timeoutMs, metadata: opts.metadata, ...(opts.privateTraffic ? { network: { allowPublicTraffic: false } } : {}) });
      cursor = (i + 1) % keys.length;
      return box as unknown as Box;
    } catch (e) {
      last = e;
      if (!isQuotaError((e as Error).message ?? "")) throw e;
      coolingUntil.set(key, Date.now() + COOLDOWN_MS);
      console.warn(`[e2b] account ${i + 1}/${keys.length} is at its limit; trying the next`);
    }
  }
  throw last instanceof Error ? new Error(`All ${keys.length} E2B accounts are at their limit: ${last.message}`) : new Error("All E2B accounts are at their limit");
}

/** Creates a workspace: owner's (or shared) server first, E2B pool if offline, full or failing. */
export async function createBox(userId: string, opts: { timeoutMs: number; metadata: Record<string, string>; privateTraffic?: boolean }): Promise<Box> {
  const row = await runnerFor(userId);
  if (row && runnerUsable(row)) {
    try {
      const secret = await secretOf(row);
      const r = await runnerCall(row.endpoint, secret, "POST", "/v1/boxes", { ttlMs: opts.timeoutMs, metadata: opts.metadata }, 120_000);
      return new RunnerBox(row.endpoint, secret, String(r.box), row.key_id, r.traffic ?? null);
    } catch (e) {
      console.warn("[runner] falling back to E2B:", (e as Error).message);
      await (await admin()).from("owner_runners").update({ status: "degraded", updated_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  return createE2b(opts);
}

/** Reconnects to an existing workspace by id; null if it is gone. Tries each pooled E2B account. */
export async function connectBox(id: string, timeoutMs = 15 * 60_000): Promise<Box | null> {
  if (isRunnerBoxId(id)) {
    const p = parseRunnerBoxId(id);
    if (!p) return null;
    const { data } = await (await admin()).from("owner_runners").select("*").eq("key_id", p.keyId).maybeSingle();
    const row = data as RunnerRow | null;
    if (!row) return null;
    try {
      const secret = await secretOf(row);
      const r = await runnerCall(row.endpoint, secret, "POST", `/v1/boxes/${p.box}/touch`, { ttlMs: timeoutMs });
      return new RunnerBox(row.endpoint, secret, p.box, row.key_id, r.traffic ?? null);
    } catch { return null; }
  }
  const keys = e2bKeys();
  if (!keys.length) return null;
  const { Sandbox } = await import("e2b");
  for (const apiKey of keys) {
    const b = await Sandbox.connect(id, { apiKey, timeoutMs }).catch(() => null);
    if (b) return b as unknown as Box;
  }
  return null;
}

export async function killBox(id: string) {
  if (isRunnerBoxId(id)) { const b = await connectBox(id, 60_000); await b?.kill().catch(() => {}); return; }
  const { Sandbox } = await import("e2b");
  for (const apiKey of e2bKeys()) if (await Sandbox.kill(id, { apiKey }).catch(() => false)) return;
}

export const hasAnyWorkspaceProvider = async (userId: string) => hasE2b() || runnerUsable(await runnerFor(userId));
