import { hasE2b } from "@/lib/e2b-pool";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const LOCAL_MODEL_LABEL = "Your server · free local model";

export const getRunner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("owner_runners").select("id, label, endpoint, status, capacity, last_seen, created_at").eq("user_id", context.userId).maybeSingle();
    const { data: model } = await context.supabase.from("provider_credentials").select("id").eq("user_id", context.userId).eq("label", LOCAL_MODEL_LABEL).maybeSingle();
    return { runner: data ?? null, localModel: !!model, e2bFallback: hasE2b() };
  });

export const pairRunner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().trim().min(20).max(2000) }))
  .handler(async ({ data, context }) => {
    const { parsePairingCode, runnerKeyId } = await import("./runner-protocol");
    const { verifyPublicTarget } = await import("./mcp-network.server");
    const { runnerCall } = await import("./runner-box.server");
    const { url, secret } = parsePairingCode(data.code);
    await verifyPublicTarget(url);
    let health: { capacity?: unknown };
    try { health = await runnerCall(url, secret, "POST", "/v1/health", {}, 15_000); }
    catch { throw new Error("Couldn't reach your server. Check that the installer finished and is still running."); }
    const { encryptSecret } = await import("./crypto.server");
    const enc = await encryptSecret(secret);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("owner_runners").upsert({
      user_id: context.userId, key_id: await runnerKeyId(secret), endpoint: url, ciphertext: enc.ciphertext, iv: enc.iv,
      status: "online", capacity: (health.capacity ?? {}) as never, last_seen: now, updated_at: now,
    }, { onConflict: "user_id" });
    if (error) throw new Error("Could not save your server");
    return { ok: true };
  });

export const removeRunner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("owner_runners").delete().eq("user_id", context.userId);
    await context.supabase.from("provider_credentials").delete().eq("user_id", context.userId).eq("label", LOCAL_MODEL_LABEL);
    return { ok: true };
  });

/** Registers the runner's Ollama as an OpenAI-compatible model connection; the key never reaches the browser. */
export const addRunnerModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ model: z.string().trim().regex(/^[a-z0-9._:-]{2,80}$/i).default("qwen2.5-coder:7b") }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("owner_runners").select("endpoint, ciphertext, iv").eq("user_id", context.userId).maybeSingle();
    if (!row) throw new Error("Pair your server first.");
    const { decryptSecret, encryptSecret } = await import("./crypto.server");
    const { localModelKey } = await import("./runner-protocol.server");
    const key = await localModelKey(await decryptSecret(row.ciphertext, row.iv));
    const { pingChat } = await import("./providers.server");
    try { await pingChat(`${row.endpoint}/ollama/v1`, key, data.model, null); }
    catch { throw new Error("Your server's local model didn't answer. It may still be downloading — try again in a few minutes."); }
    const enc = await encryptSecret(key);
    await context.supabase.from("provider_credentials").delete().eq("user_id", context.userId).eq("label", LOCAL_MODEL_LABEL);
    const { error } = await context.supabase.from("provider_credentials").insert({
      provider: "compatible", label: LOCAL_MODEL_LABEL, base_url: `${row.endpoint}/ollama/v1`, custom_models: [data.model],
      extra_body: null, ciphertext: enc.ciphertext, iv: enc.iv, last4: key.slice(-4), user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
