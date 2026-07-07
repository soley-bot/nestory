import Link from "next/link";
import { signOutAction } from "@/features/auth/actions";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";

export default function NoAccessPage() {
  return (
    <AuthPageShell
      description="This account is signed in, but it is not linked to this workspace."
      title="No workspace access"
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-foreground-muted">
          Ask an admin to add this email under Users & Roles, or sign in with an
          account that already belongs here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-surface-muted"
            href="/login"
          >
            Try another account
          </Link>
          <form action={signOutAction}>
            <button
              className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </AuthPageShell>
  );
}
