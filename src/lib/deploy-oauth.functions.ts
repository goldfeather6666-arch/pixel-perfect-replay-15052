import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const provider = z.object({ provider: z.enum(["vercel", "supabase"]) });

export const deployOAuthStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { oauthConfigured } = await import("./deploy-oauth.server");
    return { vercel: oauthConfigured("vercel"), supabase: oauthConfigured("supabase") };
  });

export const startDeployOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(provider)
  .handler(async ({ data, context }) => {
    const origin = new URL(getRequest().url).origin;
    const { beginOAuth } = await import("./deploy-oauth.server");
    const { url, digest } = await beginOAuth(context.userId, data.provider, origin);
    setCookie(`forge-deploy-${data.provider}`, digest, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/api/public/oauth", maxAge: 1800 });
    return { url };
  });

/** Finishes a sign-in whose browser cookie was lost (Vercel's install pages can drop it); bound to the signed-in user instead. */
export const finishDeployOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ provider: z.enum(["vercel", "supabase"]), state: z.string().min(10).max(200), code: z.string().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    const { completeOAuth } = await import("./deploy-oauth.server");
    return completeOAuth(data.provider, data.state, data.code, { userId: context.userId });
  });
