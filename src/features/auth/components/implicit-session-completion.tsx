"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { getLoginPath } from "@/lib/auth/login-redirect";
import { parseImplicitAuthFragment } from "@/lib/auth/implicit-session";

type ImplicitSessionCompletionProps = {
  failed?: boolean;
  nextPath: string;
};

export function ImplicitSessionCompletion({
  failed = false,
  nextPath,
}: ImplicitSessionCompletionProps) {
  const [error, setError] = useState(failed);
  const completion = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeSession() {
      const result = parseImplicitAuthFragment(window.location.hash);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      if (failed || "error" in result) return false;

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
        return response.ok;
      } catch {
        return false;
      }
    }

    completion.current ??= completeSession();
    void completion.current.then((completed) => {
      if (cancelled) return;
      if (completed) window.location.replace(nextPath);
      else setError(true);
    });

    return () => {
      cancelled = true;
    };
  }, [failed, nextPath]);

  if (error) {
    return (
      <AuthPageShell
        description={nextPath.startsWith("/accept-invite?")
          ? "Ask a workspace administrator to send a new invitation, or sign in with your existing account."
          : "This email link is invalid or has expired. Request a fresh email and try again."}
        title="We could not verify this link"
      >
        {nextPath === "/update-password" ? (
          <Link className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/forgot-password">
            Request a new recovery link
          </Link>
        ) : null}
        <Link
          className="mt-5 inline-flex text-sm font-semibold text-foreground underline-offset-4 hover:underline"
          href={getLoginPath(nextPath)}
        >
          Return to sign in
        </Link>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell description="Keep this page open." title="Signing you in">
      <p aria-live="polite" className="text-sm leading-6 text-muted-foreground">
        Verifying your secure link.
      </p>
    </AuthPageShell>
  );
}
