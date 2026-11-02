import { createFileRoute } from "@tanstack/react-router";

// Vercel signs integration webhooks with HMAC-SHA1 of the raw body using the
// integration client secret, delivered in the x-vercel-signature header.
async function hmacSha1Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Event types we currently act on. Others are acknowledged and ignored.
const HANDLED_TYPES = new Set(["deployment.ready", "deployment.error", "deployment.canceled"]);

export const Route = createFileRoute("/api/public/webhooks/vercel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.VERCEL_CLIENT_SECRET;
        if (!secret) return new Response("webhook not configured", { status: 503 });

        const body = await request.text();
        const signature = request.headers.get("x-vercel-signature") ?? "";
        const expected = await hmacSha1Hex(secret, body);
        if (!signature || !timingSafeEqual(signature, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: { type?: string; payload?: { deployment?: { id?: string; url?: string; meta?: { githubCommitSha?: string } } } };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (!event.type || !HANDLED_TYPES.has(event.type)) {
          return Response.json({ ok: true, ignored: event.type ?? "unknown" });
        }

        const deployment = event.payload?.deployment;
        console.log(
          `[vercel-webhook] ${event.type} deployment=${deployment?.id ?? "?"} url=${deployment?.url ?? "?"} sha=${deployment?.meta?.githubCommitSha ?? "?"}`,
        );
        return Response.json({ ok: true });
      },
    },
  },
});
