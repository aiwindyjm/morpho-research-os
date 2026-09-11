import { QueryClient } from "@tanstack/react-query";
import { MorphoError } from "@/services/errors";

/**
 * Async query defaults (docs/architecture/MODULE_BOUNDARIES.md: TanStack
 * Query for async state). Mock/IPC failures are surfaced to pages instead
 * of being retried into ambiguity; only retryable errors retry once.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof MorphoError) {
            return error.retryable && failureCount < 1;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
