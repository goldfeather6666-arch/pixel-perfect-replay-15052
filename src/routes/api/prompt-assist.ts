import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/prompt-assist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { handlePromptAssistance } = await import("@/lib/prompt-assistance.server");
          return await handlePromptAssistance(request, {
            url: process.env["SUPABASE_URL"],
            key: process.env["SUPABASE_PUBLISHABLE_KEY"],
          });
        } catch {
          return Response.json(
            { message: "Prompt assistance is unavailable. Your draft is unchanged." },
            { status: request.signal.aborted ? 499 : 503 },
          );
        }
      },
    },
  },
});
