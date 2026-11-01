import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/visual-compare")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const { handleVisualComparison } = await import("@/lib/visual-comparison.server");
      return await handleVisualComparison(request, { url: process.env["SUPABASE_URL"], key: process.env["SUPABASE_PUBLISHABLE_KEY"], gatewayKey: process.env["LOVABLE_API_KEY"] });
    } catch {
      return Response.json({ message: request.signal.aborted ? "Comparison stopped." : "Comparison unavailable. Your screenshots are preserved." }, { status: request.signal.aborted ? 499 : 500 });
    }
  } } },
});