"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body>
        <main>
          <h1>Nestory is temporarily unavailable</h1>
          <p>Your records were not changed. Try loading the application again.</p>
          <button onClick={reset} type="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
