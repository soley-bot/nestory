"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { PrivilegedEmailStepUp } from "@/features/account/components/privileged-email-step-up";
import { signOutAction } from "@/features/auth/actions";
import type { PrivilegedEmailStepUpStatus } from "@/features/auth/privileged-step-up";

export function WorkspacePrivilegedStepUpGate({
  children,
  organizationName,
  status,
  statusCheckRequired,
}: {
  children: ReactNode;
  organizationName: string;
  status: PrivilegedEmailStepUpStatus | null;
  statusCheckRequired: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!statusCheckRequired) return;
    const refreshInterval = status ? 60_000 : 15_000;

    const interval = window.setInterval(
      () => router.refresh(),
      refreshInterval,
    );
    return () => window.clearInterval(interval);
  }, [router, status, statusCheckRequired]);

  if (!statusCheckRequired) return children;

  const verificationRequired = Boolean(
    status?.required && status.enforcementEnabled && !status.verified,
  );

  return (
    <>
      <div
        aria-hidden={verificationRequired || undefined}
        className={verificationRequired ? "hidden" : undefined}
        data-testid="workspace-content"
        inert={verificationRequired || undefined}
      >
        {children}
      </div>
      {verificationRequired && status ? (
        <GateFrame organizationName={organizationName}>
          <ShieldCheck aria-hidden="true" className="text-primary" size={20} />
          <h1 className="mt-3 text-lg font-semibold">Verify this session</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Confirm the code sent to your account email before reopening this
            workspace. Your in-progress form is preserved, and you do not need
            to sign out or enter your password again.
          </p>
          <PrivilegedEmailStepUp status={status} />
          <div className="mt-5 border-t border-border pt-4">
            <SignOutButton />
          </div>
        </GateFrame>
      ) : null}
    </>
  );
}

function GateFrame({
  children,
  organizationName,
}: {
  children: ReactNode;
  organizationName: string;
}) {
  return (
    <main className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto bg-muted/95 px-4 py-10 sm:items-center">
      <section className="w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {organizationName}
        </p>
        {children}
      </section>
    </main>
  );
}

function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        type="submit"
      >
        <LogOut aria-hidden="true" size={15} />
        Sign out
      </button>
    </form>
  );
}
