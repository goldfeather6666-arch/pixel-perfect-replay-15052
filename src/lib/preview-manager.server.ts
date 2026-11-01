// Preview Manager: one dev server per task preview inside the task's existing E2B sandbox.
// Starts/stops/restarts servers, tracks readiness via in-sandbox HTTP checks, captures logs,
// detects crashes, and stores upstream access (encrypted) for the private gateway.
import type { PendingChange } from "./providers";
import { openTaskBox } from "./sandbox.server";
import { encryptSecret } from "./crypto.server";
import { detectFramework, detectPackageManager, devCommand, gatewayBase, installCommand, isHealthy, nextMajor, parseListening, pickPort, type Framework } from "./preview-detect";

const REPO_DIR = "/home/user/repo";
const TTL_MS = 15 * 60_000;
const MAX_AUTO_RESTARTS = 3;
const RUN_ENV = "NODE_OPTIONS=--max-old-space-size=2560 npm_config_audit=false npm_config_fund=false NEXT_TELEMETRY_DISABLED=1 BROWSER=none __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.e2b.app";

type Session = { id: string; user_id: string; repo: string; work_branch: string; sandbox_id?: string | null; pending?: unknown };
export type PreviewRow = {
  id: string; project_id: string; sandbox_id: string; branch_name: string; port: number; framework: string; command: string;
  status: string; preview_url: string; process: Record<string, unknown>; browser_errors: unknown; token_version: number;
  share_until: string | null; created_at: string; updated_at: string; expires_at: string; last_health_check_at: string | null; run_id: string | null;
};

const dirOf = (id: string) => `/tmp/forge-previews/${id}`;
const ACTIVE = ["starting", "ready", "unhealthy", "error"];

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function connect(sandboxId: string) {
  const apiKey = process.env["E2B_API_KEY"];
  if (!apiKey) throw new Error("Preview sandbox is not configured");
  const { Sandbox } = await import("e2b");
  return Sandbox.connect(sandboxId, { apiKey, timeoutMs: TTL_MS }).catch(() => null);
}

async function sh(box: import("e2b").Sandbox, cmd: string, timeoutMs = 20_000) {
  const r = await box.commands.run(cmd, { timeoutMs }).catch((e: { stdout?: string; stderr?: string; exitCode?: number }) => e);
  return { out: String(r?.stdout ?? ""), code: typeof r?.exitCode === "number" ? r.exitCode : -1 };
}

/** Marks rows whose sandbox lifetime passed as expired (cleanup of orphaned/old previews). */
export async function expireStale(sb: any, projectId?: string) {
  let q = sb.from("preview_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).in("status", ACTIVE).lt("expires_at", new Date().toISOString());
  if (projectId) q = q.eq("project_id", projectId);
  await q;
}

export async function latestPreview(sb: any, projectId: string): Promise<PreviewRow | null> {
  await expireStale(sb, projectId);
  const { data } = await sb.from("preview_sessions").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as PreviewRow) ?? null;
}

async function launch(box: import("e2b").Sandbox, row: { id: string; port: number }, framework: Framework, install: string, command: string) {
  const dir = dirOf(row.id);
  const script = [
    "set -o pipefail",
    `cd ${REPO_DIR}`,
    `[ -f ${dir}/env ] && . ${dir}/env`,
    install ? `echo "[forge] installing dependencies…"; ${install} || { echo "[forge] install failed"; exit 90; }` : "",
    `echo "[forge] starting ${framework} dev server on port ${row.port}"`,
    `exec env ${RUN_ENV} ${command}`,
  ].filter(Boolean).join("\n");
  await box.files.write(`${dir}/run.sh`, script);
  await sh(box, `rm -f ${dir}/exit; : > ${dir}/out.log`);
  // setsid: own process group so stop/restart kills the whole tree; exit code captured for crash detection.
  const h = await box.commands.run(`setsid bash -c 'bash ${dir}/run.sh >> ${dir}/out.log 2>&1; echo $? > ${dir}/exit'`, { background: true, timeoutMs: 0, cwd: REPO_DIR });
  await box.files.write(`${dir}/pid`, String(h.pid));
  return h.pid;
}

async function killTree(box: import("e2b").Sandbox, id: string, port: number) {
  const dir = dirOf(id);
  await sh(box, `p=$(cat ${dir}/pid 2>/dev/null); [ -n "$p" ] && { kill -TERM -- -$p 2>/dev/null; pkill -TERM -P $p 2>/dev/null; kill $p 2>/dev/null; }; sleep 1; fuser -k ${port}/tcp 2>/dev/null; true`);
}

/** Gives the dev server the task's PUBLIC database settings (never the service key), kept outside the repo. */
async function writePublicEnv(box: import("e2b").Sandbox, id: string, session: Session & { supabase_ref?: string | null }) {
  if (!session.supabase_ref) return;
  try {
    const { loadDatabaseSettings } = await import("./deployment-settings.server");
    const { deploymentEnv, isPublicDatabaseKey } = await import("./deployment-env");
    const saved = await loadDatabaseSettings(session.user_id, session.id, session.supabase_ref);
    let publicKey = saved?.publicKey ?? "";
    if (!publicKey) {
      // Fall back to the linked project's public key via the user's saved database token.
      const { accountRow } = await import("./accounts.server");
      const row = await accountRow(await admin(), session.user_id, "supabase", (session as { accounts?: unknown }).accounts);
      const cred = row ? [row] : [];
      if (cred.length) {
        const { decryptSecret } = await import("./crypto.server");
        const { SupabaseMgmt } = await import("./integrations.server");
        publicKey = (await new SupabaseMgmt(await decryptSecret(cred[0]!.ciphertext, cred[0]!.iv)).anonKey(session.supabase_ref)) ?? "";
      }
    }
    if (!publicKey || !isPublicDatabaseKey(publicKey)) return;
    const env = deploymentEnv(saved?.url || `https://${session.supabase_ref}.supabase.co`, publicKey) as Record<string, string>;
    const lines = Object.entries(env).filter(([k]) => !/SERVICE|SECRET/i.test(k)).map(([k, v]) => `export ${k}='${String(v).replace(/'/g, "")}'`);
    await box.files.write(`${dirOf(id)}/env`, lines.join("\n") + "\n");
    await sh(box, `chmod 600 ${dirOf(id)}/env`);
  } catch { /* preview still starts; app may show its own missing-config error */ }
}

/** Starts (or returns the existing) preview for a task. Never starts a duplicate server for an active preview. */
export async function startPreview(sb: any, session: Session, ghToken: string, opts: { command?: string; port?: number; runId?: string | null } = {}) {
  await expireStale(sb, session.id);
  const { data: existing } = await sb.from("preview_sessions").select("*").eq("project_id", session.id).in("status", ACTIVE).order("created_at", { ascending: false }).limit(1);
  const live = existing?.[0] as PreviewRow | undefined;
  if (live && live.sandbox_id === session.sandbox_id && !opts.command) {
    const st = await previewStatus(sb, live);
    if (st.status !== "crashed" && st.status !== "expired") return st;
  }
  const { box } = await openTaskBox(sb, session, ghToken, (session.pending as PendingChange[]) ?? []);
  if (live) {
    if (live.sandbox_id === box.sandboxId) await killTree(box, live.id, live.port);
    await sb.from("preview_sessions").update({ status: "stopped", token_version: live.token_version + 1, updated_at: new Date().toISOString() }).eq("id", live.id);
  }
  const ls = await sh(box, `ls -A ${REPO_DIR}; echo ---; cat ${REPO_DIR}/package.json 2>/dev/null; echo; echo ---; ss -ltn 2>/dev/null`);
  const [filesRaw = "", pkgRaw = "", ssRaw = ""] = ls.out.split("\n---\n");
  const files = filesRaw.split("\n").map((f) => f.trim()).filter(Boolean);
  let pkg = null;
  try { pkg = JSON.parse(pkgRaw.trim() || "null"); } catch { pkg = null; }
  const framework = detectFramework(pkg, files);
  const pm = detectPackageManager(files);
  const port = pickPort(parseListening(ssRaw), opts.port);

  const { data: row, error } = await sb.from("preview_sessions").insert({
    user_id: session.user_id, project_id: session.id, run_id: opts.runId ?? null, sandbox_id: box.sandboxId,
    branch_name: session.work_branch, port, framework, status: "starting",
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  }).select("*").single();
  if (error || !row) throw new Error("Could not record the preview");
  const base = gatewayBase(row.id);
  const command = opts.command?.trim() || devCommand(framework, pm, port, base, { nextMajor: nextMajor(pkg) });
  const install = opts.command ? "" : installCommand(pm, framework);
  await writePublicEnv(box, row.id, session);
  const pid = await launch(box, row, framework, install, command);

  const host = box.getHost(port);
  const token = box.trafficAccessToken ?? "";
  const { ciphertext, iv } = await encryptSecret(token);
  await (await admin()).from("preview_secrets").upsert({ preview_id: row.id, user_id: session.user_id, upstream_host: host, ciphertext, iv, updated_at: new Date().toISOString() });
  await sb.from("preview_sessions").update({ command, preview_url: base, process: { pid, pm, restarts: 0, started_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("id", row.id);
  return { ...(row as PreviewRow), command, preview_url: base, status: "starting", logTail: "" };
}

/** Checks process liveness + HTTP health inside the sandbox, updates the row, auto-restarts crashes (bounded). */
export async function previewStatus(sb: any, row: PreviewRow, opts: { autoRestart?: boolean } = {}) {
  if (!ACTIVE.includes(row.status)) return { ...row, logTail: "" };
  const box = await connect(row.sandbox_id);
  if (!box) {
    await sb.from("preview_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", row.id);
    return { ...row, status: "expired", logTail: "Sandbox expired (15 min idle). Start the preview again." };
  }
  await box.setTimeout(TTL_MS).catch(() => {});
  const dir = dirOf(row.id);
  const r = await sh(box, `p=$(cat ${dir}/pid 2>/dev/null); alive=0; [ -n "$p" ] && kill -0 $p 2>/dev/null && alive=1; [ -f ${dir}/exit ] && alive=0; code=$(curl -s -o /dev/null -m 5 -H 'Host: health.e2b.app' -w '%{http_code}' http://127.0.0.1:${row.port}${row.preview_url && (row.framework === "vite" || row.framework === "astro") ? row.preview_url : "/"}); echo "$alive|$code|$(cat ${dir}/exit 2>/dev/null)"; tail -c 4000 ${dir}/out.log 2>/dev/null`);
  const [head = "", ...rest] = r.out.split("\n");
  const [alive, codeStr, exitStr] = head.split("|");
  const code = Number(codeStr) || 0;
  const logTail = rest.join("\n");
  let status = alive === "1" ? (isHealthy(code) ? "ready" : code >= 500 ? "error" : row.status === "ready" ? "unhealthy" : "starting") : "crashed";
  const proc = { ...row.process, last_http: code, exit_code: exitStr ? Number(exitStr) : null };
  if (status === "crashed" && opts.autoRestart && Number(row.process["restarts"] ?? 0) < MAX_AUTO_RESTARTS && exitStr !== "90") {
    const pid = await launch(box, row, row.framework as Framework, "", row.command);
    Object.assign(proc, { pid, restarts: Number(row.process["restarts"] ?? 0) + 1, restarted_at: new Date().toISOString() });
    status = "starting";
  }
  const now = new Date().toISOString();
  await sb.from("preview_sessions").update({ status, process: proc, last_health_check_at: now, updated_at: now, expires_at: new Date(Date.now() + TTL_MS).toISOString() }).eq("id", row.id);
  return { ...row, status, process: proc, last_health_check_at: now, logTail };
}

/** Waits until ready/crashed or the deadline; agent tools use this so they never claim readiness early. */
export async function waitReady(sb: any, row: PreviewRow, deadlineMs = 150_000) {
  const end = Date.now() + deadlineMs;
  let st = await previewStatus(sb, row, { autoRestart: true });
  while (st.status === "starting" && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 2000));
    st = await previewStatus(sb, { ...row, ...st } as PreviewRow, { autoRestart: true });
  }
  return st;
}

export async function previewLogs(row: PreviewRow, bytes = 12_000) {
  const box = await connect(row.sandbox_id);
  if (!box) return "Sandbox expired; no logs available.";
  return (await sh(box, `tail -c ${Math.min(bytes, 60_000)} ${dirOf(row.id)}/out.log 2>/dev/null`)).out;
}

/** Error lines from server logs plus browser errors reported by the preview panel. */
export async function previewErrors(row: PreviewRow) {
  const log = await previewLogs(row, 30_000);
  const server = log.split("\n").filter((l) => /error|failed|cannot find|unexpected|exception|ERR!|✘/i.test(l)).slice(-40);
  return { server, browser: Array.isArray(row.browser_errors) ? (row.browser_errors as unknown[]).slice(-30) : [] };
}

export async function stopPreview(sb: any, row: PreviewRow) {
  const box = await connect(row.sandbox_id);
  if (box) await killTree(box, row.id, row.port);
  await sb.from("preview_sessions").update({ status: "stopped", token_version: row.token_version + 1, share_until: null, updated_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
}

export async function restartPreview(sb: any, row: PreviewRow, session?: Session & { supabase_ref?: string | null }) {
  const box = await connect(row.sandbox_id);
  if (!box) throw new Error("Sandbox expired. Start a new preview.");
  await killTree(box, row.id, row.port);
  if (session) await writePublicEnv(box, row.id, session);
  const pid = await launch(box, row, row.framework as Framework, "", row.command);
  const now = new Date().toISOString();
  await sb.from("preview_sessions").update({ status: "starting", process: { ...row.process, pid, restarted_at: now }, updated_at: now, expires_at: new Date(Date.now() + TTL_MS).toISOString() }).eq("id", row.id);
  return { ...row, status: "starting" };
}

/** Fetches a route inside the sandbox (never through the public internet) and reports its status. */
export async function checkRoute(row: PreviewRow, path: string) {
  const box = await connect(row.sandbox_id);
  if (!box) return { ok: false, status: 0, note: "Sandbox expired" };
  const clean = ("/" + path.replace(/^\/+/, "")).replace(/[^A-Za-z0-9/_\-.?=&%]/g, "");
  const prefix = row.framework === "vite" || row.framework === "astro" ? row.preview_url.replace(/\/$/, "") : "";
  const r = await sh(box, `curl -s -L -m 15 -o /tmp/route.html -w '%{http_code}' http://127.0.0.1:${row.port}${prefix}${clean}; echo; head -c 600 /tmp/route.html`);
  const [codeLine = "", ...body] = r.out.split("\n");
  const status = Number(codeLine) || 0;
  return { ok: status >= 200 && status < 400, status, path: clean, snippet: body.join("\n").slice(0, 600) };
}
