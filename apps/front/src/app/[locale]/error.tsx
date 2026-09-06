"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/react";
import { Button } from "@repo/ui/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col">
        <h1 className="text-3xl">Something went wrong</h1>
        <span className="text-muted-foreground mt-2">
          An unexpected error occurred. Please try again.
        </span>
        <div className="mt-6">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
