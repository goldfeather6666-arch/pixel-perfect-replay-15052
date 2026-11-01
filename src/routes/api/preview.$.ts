import { createFileRoute } from "@tanstack/react-router";
import { injectBridge, parsePreviewPath, rewriteLocation, rewriteRootUrls } from "@/lib/preview-gateway";

// Private preview gateway: verifies a short-lived signed token (query once, then an HttpOnly cookie
// scoped to this preview's path), then proxies to the ONE recorded sandbox port with E2B's traffic
// token. Sandbox hosts and tokens never reach the browser. Other ports are unreachable by design.

const ACTIVE = ["starting", "ready", "unhealthy", "error"];
const HOP = ["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "host", "cookie", "content-length", "accept-encoding"];

const cookieName = (id: string) => `forge_pv_${id.slice(0, 8)}`;

/** Short per-worker lookup cache (revocation bumps token_version, which changes the key). */
const LOOKUP_MS = 5000;
const LOOKUP = new Map<string, { at: number; row: { user_id: string; status: string; token_version: number; share_until: string | null; framework: string; expires_at: string }; sec: { upstream_host: string; traffic: string } | null }>();

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

  // A page load fires hundreds of module requests; look the preview up once every few seconds, not per file.
  const ck = `${id}:${claims.v}`;
  let hit = LOOKUP.get(ck);
  if (!hit || hit.at < Date.now() - LOOKUP_MS) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: row }, { data: sec }] = await Promise.all([
      supabaseAdmin.from("preview_sessions").select("user_id, status, token_version, share_until, framework, expires_at").eq("id", id).maybeSingle(),
      supabaseAdmin.from("preview_secrets").select("upstream_host, ciphertext, iv").eq("preview_id", id).maybeSingle(),
    ]);
    if (!row) { LOOKUP.delete(ck); return deny(403, "This preview link was revoked."); }
    const { decryptSecret } = await import("@/lib/crypto.server");
    hit = { at: Date.now(), row, sec: sec ? { upstream_host: sec.upstream_host, traffic: await decryptSecret(sec.ciphertext, sec.iv) } : null };
    if (LOOKUP.size > 200) LOOKUP.clear();
    LOOKUP.set(ck, hit);
  }
  const { row } = hit;
  if (row.user_id !== claims.u || row.token_version !== claims.v) return deny(403, "This preview link was revoked.");
  if (!ACTIVE.includes(row.status) || new Date(row.expires_at).getTime() < Date.now()) return deny(410, "This preview is stopped or expired.");
  if (claims.k === "share" && (!row.share_until || new Date(row.share_until).getTime() < Date.now())) return deny(403, "This share link has expired.");
  if (!hit.sec) { LOOKUP.delete(ck); return deny(503, "Preview is not reachable yet."); }
  const sec = hit.sec;
  const traffic = sec.traffic;

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
  const body = method === "GET" || method === "HEAD" ? null : await request.arrayBuffer();
  // Dev servers drop connections while compiling or restarting: retry idempotent requests briefly.
  const attempts = body === null ? 3 : 1;
  for (let i = 0; ; i++) {
    try {
      upstream = await fetch(target, { method, headers, body, redirect: "manual" });
      if (upstream.status === 502 && i < attempts - 1) throw new Error("upstream 502");
      break;
    } catch {
      if (i >= attempts - 1) return deny(503, "The dev server is busy or restarting. Refresh in a few seconds.");
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (["content-encoding", "content-length", "x-frame-options", "content-security-policy", "set-cookie", "transfer-encoding", "connection"].includes(lk)) return;
    out.set(k, v);
  });
  // Pre-bundled dependencies carry a version hash, so the browser may keep them; everything else stays fresh.
  out.set("cache-control", /\/node_modules\/\.vite\/deps\/|\/_next\/static\/chunks\//.test(rest) && /[?&]v=|\.[0-9a-f]{8,}\./.test(rest + url.search) ? "private, max-age=3600, immutable" : "private, no-store");
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
