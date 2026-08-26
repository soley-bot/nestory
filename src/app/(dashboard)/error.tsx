"use client";

import * as Sentry from "@sentry/nextjs";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDeploymentSkew = Boolean(
    unstable_isUnrecognizedActionError(error),
  );

  useEffect(() => {
    if (isDeploymentSkew) return;

    Sentry.captureException(error, {
      tags: {
        boundary: "dashboard",
        has_digest: error.digest ? "true" : "false",
        has_stack: error.stack ? "true" : "false",
      },
    });
  }, [error, isDeploymentSkew]);

  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-8 sm:px-6">
      <ErrorState
        className="w-full max-w-xl rounded-md border border-border bg-card"
        message={
          isDeploymentSkew
            ? "This browser tab is using an older version of Nestory. Reload the current version, then try the action again. Your records were not changed."
            : "This workspace view could not be loaded. Your records were not changed."
        }
        onRetry={
          isDeploymentSkew ? () => window.history.go(0) : reset
        }
        retryLabel={
          isDeploymentSkew ? "Reload current version" : "Try again"
        }
        title={isDeploymentSkew ? "Nestory was updated" : "Workspace view unavailable"}
      />
    </main>
  );
}
