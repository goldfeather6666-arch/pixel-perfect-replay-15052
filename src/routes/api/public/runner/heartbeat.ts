import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  key_id: z.string().regex(/^[a-f0-9]{20}$/),
  endpoint: z.string().url().max(300),
  capacity: z.object({ free_slots: z.number().int().min(0).max(1000), boxes: z.number().int().min(0).max(1000), mem_free_mb: z.number().min(0).optional(), load: z.number().min(0).optional() }).partial(),
});

// Called every minute by the owner's runner. HMAC-signed with the pairing secret; updates
// liveness and the (possibly rotated) tunnel address. Returns nothing private.
export const Route = createFileRoute("/api/public/runner/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 4000) return new Response("Too large", { status: 413 });
        let body: z.infer<typeof Body>;
        try { body = Body.parse(JSON.parse(raw)); } catch { return new Response("Bad request", { status: 400 }); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin.from("owner_runners").select("id, user_id, endpoint, ciphertext, iv").eq("key_id", body.key_id).maybeSingle();
        if (!row) return new Response("Unknown", { status: 404 });
        const { decryptSecret } = await import("@/lib/crypto.server");
        const { verifyRequest, normalizeEndpoint } = await import("@/lib/runner-protocol");
        const secret = await decryptSecret(row.ciphertext, row.iv);
        const ok = await verifyRequest(secret, "POST", "/api/public/runner/heartbeat", raw, request.headers.get("x-forge-ts") ?? "", request.headers.get("x-forge-signature") ?? "");
        if (!ok) return new Response("Unauthorized", { status: 401 });
        let endpoint: string;
        try { endpoint = normalizeEndpoint(body.endpoint); } catch { return new Response("Bad endpoint", { status: 400 }); }
        if (endpoint !== row.endpoint) {
          const { verifyPublicTarget } = await import("@/lib/mcp-network.server");
          try { await verifyPublicTarget(endpoint); } catch { return new Response("Endpoint not public", { status: 400 }); }
          const { LOCAL_MODEL_LABEL } = await import("@/lib/runner.functions");
          await supabaseAdmin.from("provider_credentials").update({ base_url: `${endpoint}/ollama/v1` }).eq("user_id", row.user_id).eq("label", LOCAL_MODEL_LABEL);
        }
        const now = new Date().toISOString();
        await supabaseAdmin.from("owner_runners").update({ endpoint, status: "online", capacity: body.capacity as never, last_seen: now, updated_at: now }).eq("id", row.id);
        return Response.json({ ok: true });
      },
    },
  },
});
