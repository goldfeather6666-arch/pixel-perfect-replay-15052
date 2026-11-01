// Hands-off recovery: a cloud run stores an encrypted sign-in renewal token (service-only table)
// so a scheduled job can restart it after it dies while the user's app is closed.
import { createClient } from "@supabase/supabase-js";
import { STALE_MS } from "./task-run-status";
import { HUMAN_WAIT_STAGES, MAX_AUTO_RESUMES, QUIET_MS, RECOVERY_COOLDOWN_MS, RESUME_MESSAGE, quietStopCandidates, resumeCandidates } from "./run-resume";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Records the owner's consent to restart this run unattended (no browser token is stored). */
export async function saveResumeToken(sessionId: string, userId: string) {
  const { encryptSecret } = await import("./crypto.server");
  const { ciphertext, iv } = await encryptSecret(`resume:${sessionId}`);
  await (await admin()).from("run_resume_secrets").upsert({ session_id: sessionId, user_id: userId, ciphertext, iv, attempts: 0, updated_at: new Date().toISOString() });
}

function userClient(token: string) {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => { const h = new Headers(init?.headers); h.set("apikey", key); h.set("Authorization", `Bearer ${token}`); return fetch(input, { ...init, headers: h }); } },
  });
}

export async function resumeStaleRuns(origin: string, now = Date.now()) {
  const db = await admin();
  const { decryptSecret } = await import("./crypto.server");
  const { data: secrets } = await db.from("run_resume_secrets").select("session_id, user_id, ciphertext, iv, attempts, updated_at").limit(100);
  if (!secrets?.length) return { resumed: 0, cleaned: 0 };
  const { data: sessions } = await db.from("agent_sessions").select("id, user_id, running, stop_requested, updated_at, keeper_id, execution_id").in("id", secrets.map((s: any) => s.session_id));
  const { resume, clean } = resumeCandidates<{ session_id: string; user_id: string; ciphertext: string; iv: string; attempts: number; updated_at: string }>(secrets, sessions ?? [], now, STALE_MS);
  if (clean.length) await db.from("run_resume_secrets").delete().in("session_id", clean);
  let resumed = 0;
  const resumedIds = new Set<string>();
  const { startKeeper, stopKeeper } = await import("./background-run.server");
  for (const s of resume.slice(0, 4)) {
    try {
      if ((await decryptSecret(s.ciphertext, s.iv)) !== `resume:${s.session_id}`) continue;
      // Database-backed lease: competing callbacks cannot spend the same attempt.
      const { data: lease } = await db.from("run_resume_secrets").update({ attempts: s.attempts + 1, updated_at: new Date(now).toISOString() })
        .eq("session_id", s.session_id).eq("attempts", s.attempts).eq("updated_at", s.updated_at)
        .lte("updated_at", new Date(now - RECOVERY_COOLDOWN_MS).toISOString()).select("session_id");
      if (!lease?.length) continue;
      const { data: lastRun } = await db.from("agent_runs").select("stage, ended_at").eq("session_id", s.session_id).order("started_at", { ascending: false }).limit(1).maybeSingle();
      // Never turn an approval wait, provider denial/failure, or finished run into unattended work.
      if (lastRun && (lastRun.ended_at || ["COMPLETED", "FAILED", "CANCELLED", "BLOCKED", "AWAITING_APPROVAL", "AWAITING_INPUT"].includes(lastRun.stage))) {
        await db.from("run_resume_secrets").delete().eq("session_id", s.session_id);
        continue;
      }
      const task = sessions?.find((t: any) => t.id === s.session_id && t.user_id === s.user_id);
      if (!task) continue;
      // Fence the old execution before terminating its keeper. A late heartbeat/final save cannot overwrite recovery.
      const { data: fenced } = await db.from("agent_sessions").update({ execution_id: crypto.randomUUID() })
        .eq("id", task.id).eq("user_id", s.user_id).eq("running", true).eq("stop_requested", false)
        .eq("updated_at", task.updated_at).select("id");
      if (!fenced?.length) continue;
      if (task.keeper_id) await stopKeeper(task.keeper_id);
      // A separate one-off session for the run's owner, so the user's own sign-in is never rotated or revoked.
      const { data: u } = await db.auth.admin.getUserById(s.user_id);
      if (!u?.user?.email) continue;
      const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
      if (le || !link?.properties?.hashed_token) continue;
      const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
      const anon = createClient(process.env["SUPABASE_URL"]!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
      if (error || !data.session || data.user?.id !== s.user_id) continue;
      const r = await startKeeper({ sb: userClient(data.session.access_token), userId: s.user_id, sessionId: s.session_id, origin, token: data.session.access_token, recovery: true, body: JSON.stringify({ sessionId: s.session_id, message: RESUME_MESSAGE }) });
      if (r?.ok) { resumed++; resumedIds.add(s.session_id); }
    } catch (e) {
      console.error("auto-resume failed", s.session_id, e instanceof Error ? e.message : "error");
    }
  }
  // Recovery had its chance; a run still silent past the quiet limit gives its sandbox back.
  const stopped = await stopQuietRuns(db, now, resumedIds);
  return { resumed, cleaned: clean.length, stopped, max: MAX_AUTO_RESUMES };
}

/** Releases sandboxes held by runs that stopped reporting, sparing anything a person still owes. */
async function stopQuietRuns(db: any, now: number, skip: Set<string>) {
  const cutoff = new Date(now - QUIET_MS).toISOString();
  const { data: rows } = await db.from("agent_sessions")
    .select("id, user_id, running, stop_requested, updated_at")
    .eq("running", true).eq("stop_requested", false).lte("updated_at", cutoff)
    .order("updated_at", { ascending: true }).limit(25);
  if (!rows?.length) return 0;
  const candidates: any[] = [];
  for (const r of rows) {
    if (skip.has(r.id)) continue;
    const { data: lastRun } = await db.from("agent_runs").select("stage").eq("session_id", r.id)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    candidates.push({ ...r, last_stage: lastRun?.stage ?? null });
  }
  const doomed = quietStopCandidates(candidates, now, QUIET_MS);
  if (!doomed.length) return 0;
  const { stopAgentSession } = await import("./session-stop.server");
  let stopped = 0;
  for (const s of doomed) {
    try { await stopAgentSession(db, s.id, s.user_id); stopped++; }
    catch (e) { console.error("quiet-run stop failed", s.id, e instanceof Error ? e.message : "error"); }
  }
  return stopped;
}
