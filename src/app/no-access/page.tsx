import Link from "next/link";
import { signOutAction } from "@/features/auth/actions";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { requireUser } from "@/lib/auth/context";

export default async function NoAccessPage() {
  await requireUser();

  return (
    <AuthPageShell
      description="This account is signed in, but it is not linked to this workspace."
      title="No workspace access"
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-foreground-muted">
          Ask a workspace administrator to add this email through Workspace Access,
          or sign in with an account that already belongs here.
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={signOutAction}>
            <button
              className="inline-flex h-9 items-center rounded-md border border-foreground bg-foreground px-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              type="submit"
            >
              Use another account
            </button>
          </form>
          <Link
            className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href="/"
          >
            Return home
          </Link>
        </div>
      </div>
    </AuthPageShell>
  );
}
