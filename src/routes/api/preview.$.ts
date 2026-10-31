import { createFileRoute } from "@tanstack/react-router";
import { injectBridge, parsePreviewPath, rewriteLocation, rewriteRootUrls } from "@/lib/preview-gateway";

// Private preview gateway: verifies a short-lived signed token (query once, then an HttpOnly cookie
// scoped to this preview's path), then proxies to the ONE recorded sandbox port with E2B's traffic
// token. Sandbox hosts and tokens never reach the browser. Other ports are unreachable by design.

const ACTIVE = ["starting", "ready", "unhealthy"];
const HOP = ["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "host", "cookie", "content-length", "accept-encoding"];

const cookieName = (id: string) => `forge_pv_${id.slice(0, 8)}`;

function readCookie(req: Request, name: string) {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function deny(status: number, msg: string) {
  return new Response(`<!doctype html><meta name=viewport content="width=device-width"><body style="font:14px system-ui;background:#0b0f0d;color:#cfe;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;max-width:320px"><p style="font-size:28px;margin:0">🔒</p><p>${msg}</p></div>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const parsed = parsePreviewPath(url.pathname);
  if (!parsed) return deny(404, "Unknown preview.");
  const { id, rest } = parsed;
  const base = `/api/preview/${id}/`;
  const { verifyPreviewToken, previewSecret } = await import("@/lib/preview-token.server");
  const secret = previewSecret();

  // First visit: exchange ?forge_t= for a path-scoped HttpOnly cookie, then strip it from the URL.
  const qt = url.searchParams.get("forge_t");
  if (qt) {
    const c = await verifyPreviewToken(qt, secret);
    if (!c || c.p !== id) return deny(401, "This preview link is invalid or expired. Open it again from Forge.");
    url.searchParams.delete("forge_t");
    const maxAge = Math.max(60, Math.floor((c.e - Date.now()) / 1000));
    return new Response(null, {
      status: 302,
      headers: {
        location: url.pathname + (url.search || ""),
        "set-cookie": `${cookieName(id)}=${encodeURIComponent(qt)}; Path=${base}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`,
        "cache-control": "no-store",
      },
    });
  }

  const token = readCookie(request, cookieName(id));
  const claims = token ? await verifyPreviewToken(token, secret) : null;
  if (!claims || claims.p !== id) return deny(401, "Preview access expired. Reopen the preview from Forge.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin.from("preview_sessions").select("user_id, status, token_version, share_until, framework, expires_at").eq("id", id).maybeSingle();
  if (!row || row.user_id !== claims.u || row.token_version !== claims.v) return deny(403, "This preview link was revoked.");
  if (!ACTIVE.includes(row.status) || new Date(row.expires_at).getTime() < Date.now()) return deny(410, "This preview is stopped or expired.");
  if (claims.k === "share" && (!row.share_until || new Date(row.share_until).getTime() < Date.now())) return deny(403, "This share link has expired.");
  const { data: sec } = await supabaseAdmin.from("preview_secrets").select("upstream_host, ciphertext, iv").eq("preview_id", id).maybeSingle();
  if (!sec) return deny(503, "Preview is not reachable yet.");
  const { decryptSecret } = await import("@/lib/crypto.server");
  const traffic = await decryptSecret(sec.ciphertext, sec.iv);

  const nativeBase = row.framework === "vite" || row.framework === "astro";
  const upstreamPath = nativeBase ? `${base.slice(0, -1)}${rest}` : rest;
  const target = `https://${sec.upstream_host}${upstreamPath}${url.search}`;
  const headers = new Headers();
  request.headers.forEach((v, k) => { if (!HOP.includes(k.toLowerCase())) headers.set(k, v); });
  if (traffic) headers.set("e2b-traffic-access-token", traffic);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", "https");

  // WebSockets (HMR): pass the upgrade through to the same single upstream port.
  if ((request.headers.get("upgrade") ?? "").toLowerCase() === "websocket") {
    headers.set("upgrade", "websocket");
    headers.set("connection", "Upgrade");
    return fetch(target, { headers });
  }

  const method = request.method.toUpperCase();
  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(), redirect: "manual" });
  } catch {
    return deny(502, "The dev server is not answering yet. It may still be starting.");
  }
  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (["content-encoding", "content-length", "x-frame-options", "content-security-policy", "set-cookie", "transfer-encoding", "connection"].includes(lk)) return;
    out.set(k, v);
  });
  out.set("cache-control", "private, no-store");
  const loc = upstream.headers.get("location");
  if (loc) out.set("location", rewriteLocation(loc, sec.upstream_host, base));
  // Upstream cookies: keep them, but scoped to this preview's path.
  const setCookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of setCookies) out.append("set-cookie", c.replace(/;\s*Path=[^;]*/i, "") + `; Path=${base}`);

  const type = upstream.headers.get("content-type") ?? "";
  const textual = /text\/html|javascript|text\/css/.test(type);
  if (!textual || method === "HEAD") return new Response(upstream.body, { status: upstream.status, headers: out });
  let text = await upstream.text();
  if (!nativeBase) text = rewriteRootUrls(text, base);
  if (type.includes("text/html")) text = injectBridge(text);
  return new Response(text, { status: upstream.status, headers: out });
}

export const Route = createFileRoute("/api/preview/$")({
  server: { handlers: { GET: handle, HEAD: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle, OPTIONS: handle } },
});
