import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { recoveringServerFetch } from "./lib/server-function-recovery";

const recoverServerFunctions = createMiddleware({ type: "function" }).client(async ({ next }) =>
  next({ fetch: recoveringServerFetch }),
);

/** True when the error, or anything in its cause chain, is a client disconnect. */
function isAbort(error: unknown): boolean {
  for (let e = error, i = 0; e != null && typeof e === "object" && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    if ((e as { name?: string }).name === "AbortError") return true;
  }
  return false;
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // The browser dropped the request (reload, navigation, closed tab): not a server crash.
    if (isAbort(error)) {
      return new Response(null, { status: 499 });
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, recoverServerFunctions],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
