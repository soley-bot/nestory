"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/error-state";
import { parseImplicitAuthFragment } from "@/lib/auth/implicit-session";

type ImplicitSessionCompletionProps = {
  nextPath: string;
};

const FAILURE_MESSAGE =
  "This email link is invalid or has expired. Request a fresh email and try again.";

export function ImplicitSessionCompletion({
  nextPath,
}: ImplicitSessionCompletionProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeSession() {
      const result = parseImplicitAuthFragment(window.location.hash);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );

      if ("error" in result) {
        setError(FAILURE_MESSAGE);
        return;
      }

      try {
        const response = await fetch("/auth/session", {
          body: JSON.stringify({
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
            ...(result.type ? { type: result.type } : {}),
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Session completion failed.");
        }

        if (!cancelled) {
          window.location.replace(nextPath);
        }
      } catch {
        if (!cancelled) {
          setError(FAILURE_MESSAGE);
        }
      }
    }

    void completeSession();

    return () => {
      cancelled = true;
    };
  }, [nextPath]);

  if (error) {
    return (
      <div>
        <ErrorState
          className="min-h-0 px-0 py-0"
          message={error}
          title="We could not verify this link"
        />
        <Link
          className="mt-5 inline-flex text-sm font-semibold text-foreground underline-offset-4 hover:underline"
          href="/login"
        >
          Return to sign in
        </Link>
      </div>
    );
  }

  return (
    <p
      aria-live="polite"
      className="text-sm leading-6 text-foreground-muted"
    >
      Verifying your secure link…
    </p>
  );
}
