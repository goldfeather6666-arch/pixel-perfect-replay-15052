// Cross-run cache of an MCP server's tool list, so tasks skip discovery round trips.
export const MCP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const MCP_CACHE_MAX_BYTES = 400_000;

export type CachedTool = { name: string; description?: string | undefined; inputSchema: unknown; annotations?: { readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined } | undefined };

/** Cached definitions only when they were saved for this exact URL and are still fresh. */
export function freshCachedTools(row: { url: string; tool_cache?: unknown; tool_cache_url?: string | null; tool_cache_at?: string | null }, now = Date.now()): CachedTool[] | null {
  if (!row.tool_cache_at || row.tool_cache_url !== row.url || !Array.isArray(row.tool_cache)) return null;
  const at = Date.parse(row.tool_cache_at);
  if (!Number.isFinite(at) || now - at > MCP_CACHE_TTL_MS || at > now + 60_000) return null;
  const tools = row.tool_cache as CachedTool[];
  return tools.every((t) => t && typeof t.name === "string") ? tools : null;
}

/** Compact definitions for storage, or null when too large to cache. */
export function toCache(defs: { name: string; description?: string | undefined; inputSchema: unknown; annotations?: unknown }[]): CachedTool[] | null {
  const out = defs.map((d) => ({ name: d.name, description: (d.description ?? "").slice(0, 1500), inputSchema: d.inputSchema, ...(d.annotations ? { annotations: d.annotations as CachedTool["annotations"] } : {}) }));
  return JSON.stringify(out).length > MCP_CACHE_MAX_BYTES ? null : out;
}
