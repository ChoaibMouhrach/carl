import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/base-api";

const MAX_RETRIES = 3;

// A 4xx answer will not change on a retry, so only failures that may pass are retried
const shouldRetry = (failureCount: number, error: Error) =>
  !(error instanceof ApiError && error.statusCode < 500) &&
  failureCount < MAX_RETRIES;

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry } },
});
