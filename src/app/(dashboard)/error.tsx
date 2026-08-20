"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({
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
    <main className="grid min-h-[60vh] place-items-center px-4 py-8 sm:px-6">
      <ErrorState
        className="w-full max-w-xl rounded-md border border-border bg-card"
        message="This workspace view could not be loaded. Check the related record before retrying the action."
        onRetry={reset}
        title="Workspace view unavailable"
      />
    </main>
  );
}
