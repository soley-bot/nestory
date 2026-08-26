"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  requestPrivilegedEmailStepUpAction,
  verifyPrivilegedEmailStepUpAction,
  type PrivilegedEmailStepUpStatus,
} from "@/features/auth/privileged-step-up";

export function PrivilegedEmailStepUp({
  status,
}: {
  status: PrivilegedEmailStepUpStatus;
}) {
  const router = useRouter();
  const [requestState, requestAction, requestPending] = useActionState(
    requestPrivilegedEmailStepUpAction,
    {},
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyPrivilegedEmailStepUpAction,
    {},
  );
  const verifiedForSession =
    verifyState.status === "success" || status.verified;

  useEffect(() => {
    if (verifyState.status === "success") router.refresh();
  }, [router, verifyState.status]);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-sm font-semibold">Privileged email verification</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Codes are sent only to {status.email}. They expire after 10 minutes and
            are limited to five attempts.
          </p>
          {!status.enforcementEnabled ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Staged control: privileged access is not blocked by this verification yet.
            </p>
          ) : null}
          {verifiedForSession ? (
            <p className="mt-2 text-sm font-medium text-success">
              Verified for this signed-in session.
            </p>
          ) : null}
        </div>
        <form action={requestAction}>
          <button
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={requestPending}
            type="submit"
          >
            {requestPending ? "Sending…" : "Email a code"}
          </button>
        </form>
      </div>

      {requestState.message ? (
        <p
          className={`mt-2 text-sm ${requestState.status === "error" ? "text-danger" : "text-muted-foreground"}`}
          role="status"
        >
          {requestState.message}
        </p>
      ) : null}

      {requestState.challengeId ? (
        <form action={verifyAction} className="mt-3 flex max-w-md flex-wrap gap-2">
          <input
            name="challengeId"
            type="hidden"
            value={requestState.challengeId}
          />
          <label className="sr-only" htmlFor="privileged-step-up-code">
            Eight-digit verification code
          </label>
          <input
            autoComplete="one-time-code"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm tracking-[0.15em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="privileged-step-up-code"
            inputMode="numeric"
            maxLength={8}
            name="code"
            pattern="[0-9]{8}"
            placeholder="8-digit code"
            required
          />
          <button
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={verifyPending}
            type="submit"
          >
            {verifyPending ? "Verifying…" : "Verify"}
          </button>
        </form>
      ) : null}

      {verifyState.message ? (
        <p
          className={`mt-2 text-sm ${verifyState.status === "error" ? "text-danger" : "text-success"}`}
          role="status"
        >
          {verifyState.message}
        </p>
      ) : null}
    </div>
  );
}
