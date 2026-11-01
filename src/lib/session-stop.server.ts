/** Persist consent first; heartbeat races and remote cleanup must not block Stop. */
export async function stopAgentSession(db: any, sessionId: string, userId: string) {
  const executionId = crypto.randomUUID();
  const { data: stopped, error } = await db.from("agent_sessions").update({
    stop_requested: true,
    running: false,
    execution_id: executionId,
    updated_at: new Date().toISOString(),
  }).eq("id", sessionId).eq("user_id", userId).select("id, keeper_id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!stopped) throw new Error("Task not found");
  // The old execution observes the fence on its independent Stop poll. Allow it
  // to cancel shell/model work before disconnecting its keeper; never await this.
  if (stopped.keeper_id) {
    const keeperId = stopped.keeper_id;
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const { stopKeeper } = await import("./background-run.server");
      await stopKeeper(keeperId);
      await db.from("agent_sessions").update({ keeper_id: null })
        .eq("id", sessionId).eq("user_id", userId)
        .eq("execution_id", executionId).eq("keeper_id", keeperId);
    })().catch(() => {});
  }
  return { ok: true };
}