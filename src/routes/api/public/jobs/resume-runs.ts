import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { agentOrigin } from "@/lib/background-run";

export const Route = createFileRoute("/api/public/jobs/resume-runs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const origin = agentOrigin(request) ?? new URL(request.url).origin;
        const { resumeStaleRuns } = await import("@/lib/run-resume.server");
        return Response.json(await resumeStaleRuns(origin));
      },
    },
  },
});
