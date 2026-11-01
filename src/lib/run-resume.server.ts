// Hands-off recovery: a cloud run stores an encrypted sign-in renewal token (service-only table)
// so a scheduled job can restart it after it dies while the user's app is closed.
import { createClient } from "@supabase/supabase-js";
import { STALE_MS } from "./task-run-status";
import { MAX_AUTO_RESUMES, RESUME_MESSAGE, resumeCandidates } from "./run-resume";

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
  const { data: secrets } = await db.from("run_resume_secrets").select("session_id, user_id, ciphertext, iv, attempts");
  if (!secrets?.length) return { resumed: 0, cleaned: 0 };
  const { data: sessions } = await db.from("agent_sessions").select("id, user_id, running, stop_requested, updated_at").in("id", secrets.map((s: any) => s.session_id));
  const { resume, clean } = resumeCandidates(secrets, sessions ?? [], now, STALE_MS);
  if (clean.length) await db.from("run_resume_secrets").delete().in("session_id", clean);
  let resumed = 0;
  const { startKeeper } = await import("./background-run.server");
  for (const s of resume) {
    try {
      if ((await decryptSecret(s.ciphertext, s.iv)) !== `resume:${s.session_id}`) continue;
      // A separate one-off session for the run's owner, so the user's own sign-in is never rotated or revoked.
      const { data: u } = await db.auth.admin.getUserById(s.user_id);
      if (!u?.user?.email) continue;
      const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
      if (le || !link?.properties?.hashed_token) continue;
      const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
      const anon = createClient(process.env["SUPABASE_URL"]!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
      if (error || !data.session || data.user?.id !== s.user_id) continue;
      await db.from("run_resume_secrets").update({ attempts: s.attempts + 1, updated_at: new Date().toISOString() }).eq("session_id", s.session_id);
      const r = await startKeeper({ sb: userClient(data.session.access_token), userId: s.user_id, sessionId: s.session_id, origin, token: data.session.access_token, body: JSON.stringify({ sessionId: s.session_id, message: RESUME_MESSAGE }) });
      if (r?.ok) resumed++;
    } catch (e) {
      console.error("auto-resume failed", s.session_id, e instanceof Error ? e.message : "error");
    }
  }
  return { resumed, cleaned: clean.length, max: MAX_AUTO_RESUMES };
}
