import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isStaleServerFunctionError, recoverChunkLoad } from "./lib/chunk-recovery";

// Background polls call server functions by ID; after a server restart those IDs can be stale. Reload once
// (bounded) instead of letting every poll fail until the user refreshes by hand.
function onDataError(error: unknown) {
  if (typeof window !== "undefined" && isStaleServerFunctionError(error)) recoverChunkLoad();
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: onDataError }),
    mutationCache: new MutationCache({ onError: onDataError }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
