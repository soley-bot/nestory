"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-8 sm:px-6">
      <ErrorState
        className="w-full max-w-xl rounded-md border border-border bg-surface"
        message="This workspace view could not be loaded. Your records were not changed."
        onRetry={reset}
        title="Workspace view unavailable"
      />
    </main>
  );
}
