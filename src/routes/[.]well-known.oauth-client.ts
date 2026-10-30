import { createFileRoute } from "@tanstack/react-router";
import { mcpClientMetadata } from "@/lib/mcp-client-metadata";

export const Route = createFileRoute("/.well-known/oauth-client")({
  server: { handlers: { GET: async ({ request }) => Response.json(mcpClientMetadata(new URL(request.url).origin), { headers: { "cache-control": "public, max-age=300" } }) } },
});