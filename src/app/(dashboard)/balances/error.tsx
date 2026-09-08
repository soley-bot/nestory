"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function OwnerAccountsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        boundary: "owner-accounts",
        has_digest: error.digest ? "true" : "false",
      },
    });
  }, [error]);

  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-8 sm:px-6">
      <ErrorState
        className="w-full max-w-xl rounded-md border border-border bg-card"
        message="The owner-account register is temporarily unavailable. Your records were not changed."
        onRetry={retry}
        title="Owner accounts could not be loaded"
      />
    </main>
  );
}
