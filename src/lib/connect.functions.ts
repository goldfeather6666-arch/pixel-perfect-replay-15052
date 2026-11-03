import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function owned(ctx: { supabase: any; userId: string }, id: string) {
  const { data, error } = await ctx.supabase.from("agent_sessions").select("*").eq("id", id).eq("user_id", ctx.userId).single();
  if (error || !data) throw new Error("Task not found");
  return data;
}

/** Wires GitHub + database + Vercel together (settings, sign-in links, migrations) and returns a health checklist. */
export const syncProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = await owned(context, data.id);
    const { syncProject: run } = await import("./connect.server");
    const r = await run(context.supabase, s, { applyMigrations: true });
    return { steps: r.steps, overall: r.overall };
  });

