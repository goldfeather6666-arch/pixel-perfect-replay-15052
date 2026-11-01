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
    setCookie(`forge-deploy-${data.provider}`, digest, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/api/public/oauth", maxAge: 600 });
    return { url };
  });
