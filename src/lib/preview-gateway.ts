// Pure helpers for the preview gateway: path parsing, URL rewriting and the error-reporting snippet.

export const PREVIEW_ID_RE = /^[0-9a-f-]{36}$/;

/** "/api/preview/<id>/<rest>" -> { id, rest } */
export function parsePreviewPath(pathname: string): { id: string; rest: string } | null {
  const m = pathname.match(/^\/api\/preview\/([0-9a-f-]{36})(\/.*)?$/);
  if (!m || !PREVIEW_ID_RE.test(m[1]!)) return null;
  return { id: m[1]!, rest: m[2] ?? "/" };
}

/**
 * Rewrites root-relative URLs ("/x") in HTML/CSS/JS to live under the gateway base, skipping
 * protocol-relative ("//cdn") and already-prefixed URLs. Used for frameworks without a base-path flag.
 */
export function rewriteRootUrls(text: string, base: string): string {
  const b = base.replace(/\/$/, "");
  const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const skip = `(?!/|${esc.slice(1)})`;
  return text
    .replace(new RegExp(`((?:src|href|action|poster)=["'])/${skip}`, "g"), `$1${b}/`)
    .replace(new RegExp(`(url\\(["']?)/${skip}`, "g"), `$1${b}/`)
    .replace(new RegExp(`((?:from|import)\\s*\\(?\\s*["'])/${skip}`, "g"), `$1${b}/`)
    .replace(new RegExp(`(["'])/(_next|@vite|@fs|@id|node_modules|src|assets|static|_nuxt|_app)/`, "g"), `$1${b}/$2/`);
}

/** Maps an upstream redirect Location back into the gateway. */
export function rewriteLocation(loc: string, upstreamHost: string, base: string): string {
  const b = base.replace(/\/$/, "");
  try {
    const u = new URL(loc, `https://${upstreamHost}`);
    if (u.host !== upstreamHost) return loc;
    return u.pathname.startsWith(`${b}/`) ? u.pathname + u.search + u.hash : `${b}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return loc;
  }
}

/** Injected into HTML: forwards runtime errors to the Forge preview panel via postMessage. */
export const ERROR_BRIDGE = `<script>(function(){function s(m){try{parent.postMessage({forgePreviewError:String(m).slice(0,1000),path:location.pathname},"*")}catch(e){}}addEventListener("error",function(e){s((e.message||"Error")+(e.filename?" @ "+e.filename+":"+e.lineno:""))});addEventListener("unhandledrejection",function(e){s("Unhandled rejection: "+((e.reason&&e.reason.message)||e.reason))});var ce=console.error;console.error=function(){s(Array.prototype.join.call(arguments," "));return ce.apply(console,arguments)}})();</script>`;

export function injectBridge(html: string) {
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + ERROR_BRIDGE) : ERROR_BRIDGE + html;
}
