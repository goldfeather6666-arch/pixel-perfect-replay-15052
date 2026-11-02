import { createFileRoute } from "@tanstack/react-router";

function cookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export const Route = createFileRoute("/api/public/oauth/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const p = params.provider;
        const url = new URL(request.url);
        const back = (q: string) => new Response(null, { status: 302, headers: { location: `/settings?${q}`, "set-cookie": `forge-deploy-${p}=; Path=/api/public/oauth; Max-Age=0; HttpOnly; SameSite=Lax` } });
        if (p !== "vercel" && p !== "supabase") return new Response("Not found", { status: 404 });
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!state || !code) return back(`connect_error=${encodeURIComponent("Sign-in was cancelled.")}`);
        try {
          const { completeOAuth } = await import("@/lib/deploy-oauth.server");
          const bound = cookie(request, `forge-deploy-${p}`);
          // Cookie dropped by the provider's install flow: let the signed-in Settings page finish it for its own user.
          if (!bound) return back(`finish=${p}&state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`);
          const r = await completeOAuth(p, state, code, { cookieDigest: bound });
          return back(`connected=${p}&account=${encodeURIComponent(r.label)}`);
        } catch (e) {
          console.error("deploy oauth callback failed", p, e instanceof Error ? e.message : "error");
          return back(`connect_error=${encodeURIComponent(e instanceof Error ? e.message : "Sign-in failed.")}`);
        }
      },
    },
  },
});
