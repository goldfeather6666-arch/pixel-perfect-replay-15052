import { createFileRoute } from "@tanstack/react-router";
import { hmacSha1Hex, timingSafeEqual, VERCEL_HANDLED_TYPES } from "@/lib/vercel-webhook";

export const Route = createFileRoute("/api/public/webhooks/vercel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["VERCEL_CLIENT_SECRET"];
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

        if (!event.type || !VERCEL_HANDLED_TYPES.has(event.type)) {
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
