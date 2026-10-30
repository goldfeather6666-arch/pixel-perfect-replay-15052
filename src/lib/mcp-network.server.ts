import { publicMcpUrl, isPublicIpv4 } from "./mcp-policy";

export async function verifyPublicTarget(raw: string) {
  const url = new URL(raw);
  // OAuth endpoints may contain queries, but never credentials or fragments.
  const base = new URL(url); base.search = "";
  publicMcpUrl(base.href);
  const dns = await globalThis.fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=A`, {
    headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(10000), redirect: "manual",
  });
  const record = await dns.json() as { Answer?: { type: number; data: string }[] };
  const addresses = record.Answer?.filter((a) => a.type === 1) ?? [];
  if (!addresses.length || addresses.some((a) => !isPublicIpv4(a.data))) throw new Error("Server must resolve to public internet addresses");
  return url;
}

export function guardedMcpFetch(serverUrl: string, oauth = false): typeof fetch {
  return async (input, init) => {
    const target = await verifyPublicTarget(input instanceof Request ? input.url : String(input));
    if (!oauth && target.origin !== new URL(serverUrl).origin) throw new Error("Cross-origin MCP request blocked");
    // OAuth SDK creates each request's credentials, never forward a static MCP bearer.
    const response = await globalThis.fetch(input, { ...init, redirect: "manual", signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(20000)]) });
    if (response.status >= 300 && response.status < 400) throw new Error("MCP redirects are not allowed");
    return response;
  };
}