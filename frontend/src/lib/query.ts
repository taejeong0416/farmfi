import { QueryClient } from "@tanstack/react-query";

// Shared QueryClient. On the client we reuse a singleton so state survives
// re-renders; on the server we always create a fresh instance per request.
let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
