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

type CompletionResult = "verified" | "invalid" | "unconfirmed";
const VERIFICATION_TIMEOUT_MS = 20_000;

export function ImplicitSessionCompletion({
  failed = false,
  nextPath,
}: ImplicitSessionCompletionProps) {
  const [error, setError] = useState<Exclude<CompletionResult, "verified"> | null>(failed ? "invalid" : null);
  const completion = useRef<Promise<CompletionResult> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeSession(): Promise<CompletionResult> {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = parseImplicitAuthFragment(window.location.hash);
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        if (failed || "error" in result) return "invalid";

        const controller = new AbortController();
        const request = fetch("/auth/session", {
          body: JSON.stringify({
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
            ...(result.type ? { type: result.type } : {}),
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });
        const deadline = new Promise<null>((resolve) => {
          timeout = setTimeout(() => {
            // The server may already have established a session. Do not repeat
            // the request or allow a late response to navigate unexpectedly.
            resolve(null);
            controller.abort();
          }, VERIFICATION_TIMEOUT_MS);
        });
        const response = await Promise.race([request, deadline]);
        return response?.ok ? "verified" : response ? "invalid" : "unconfirmed";
      } catch {
        return "unconfirmed";
      } finally {
        clearTimeout(timeout);
      }
    }

    completion.current ??= completeSession();
    void completion.current.then((completed) => {
      if (cancelled) return;
      if (completed === "verified") window.location.replace(nextPath);
      else setError(completed);
    }).catch(() => {
      if (!cancelled) setError("unconfirmed");
    });

    return () => {
      cancelled = true;
    };
  }, [failed, nextPath]);

  if (error) {
    return (
      <AuthPageShell
        description={error === "unconfirmed"
          ? "We could not confirm sign-in. Return to sign in with your existing account."
          : nextPath.startsWith("/accept-invite?")
          ? "Ask a workspace administrator to send a new invitation, or sign in with your existing account."
          : "This email link is invalid or has expired. Request a fresh email and try again."}
        title="We could not verify this link"
      >
        {nextPath === "/update-password" ? (
          <Link className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/forgot-password">
            Request a new reset link
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
