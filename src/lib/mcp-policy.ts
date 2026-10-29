import { z } from "zod";

export function publicMcpUrl(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search ||
    (url.port && url.port !== "443") || !host.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
    /^[\d.]+$/.test(host) || host.includes(":")) {
    throw new Error("Use a public HTTPS server URL without credentials, query parameters or a custom port.");
  }
  return url.toString();
}

export const connectionInput = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().max(2048).transform(publicMcpUrl),
  token: z.string().max(4000).refine((s) => !/[\r\n]/.test(s), "Invalid token"),
  trusted: z.literal(true),
});

export function isPublicIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return a !== 0 && a !== 10 && a !== 127 && a !== 169 && a !== 192 &&
    !(a === 172 && b !== undefined && b >= 16 && b <= 31) &&
    !(a === 100 && b !== undefined && b >= 64 && b <= 127) &&
    a !== undefined && a < 224 && !(a === 198 && (b === 18 || b === 19));
}

export function readOnlyTool(t: { annotations?: { readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined } | undefined }) {
  return t.annotations?.readOnlyHint === true && t.annotations.destructiveHint !== true;
}

export function allowedMcpTool(url: string, t: { name: string; annotations?: { readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined } | undefined }) {
  // Official public DeepWiki docs endpoints omit annotations; allow only its documented reads.
  if (url === "https://mcp.deepwiki.com/mcp" && t.annotations?.destructiveHint !== true &&
    ["read_wiki_structure", "read_wiki_contents", "ask_wiki_question"].includes(t.name)) return true;
  return readOnlyTool(t);
}