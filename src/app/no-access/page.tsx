import Link from "next/link";
import { signOutAction } from "@/features/auth/actions";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { requireUser } from "@/lib/auth/context";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";

/**
 * Two unrelated conditions land here: an account with no membership at all, and a
 * member who simply lacks a capability. Telling the second group they are "not
 * linked to this workspace" is false, and offering them sign-out as the way
 * forward pushes them out of a product they belong to.
 *
 * `reason` is a presentation hint only — it never grants access. A member who
 * arrives with it and turns out to have no membership is bounced back here by
 * /workspace without it, and reads the membership copy instead.
 */
type NoAccessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NoAccessPage({ searchParams }: NoAccessPageProps = {}) {
  await requireUser();
  const params = (await searchParams) ?? {};
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;

  if (reason === "capability") {
    return (
      <AuthPageShell
        description="Your account does not include this area of the workspace."
        title="You do not have access to this area"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Your access level covers a different part of Nestory. Ask a workspace
            administrator if you need this added.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-9 items-center rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              href={WORKSPACE_ENTRY_PATH}
            >
              Back to your workspace
            </Link>
            <form action={signOutAction}>
              <button
                className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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

  return (
    <AuthPageShell
      description="This account is signed in, but it is not linked to this workspace."
      title="No workspace access"
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Ask a workspace administrator to add this email through Workspace Access,
          or sign in with an account that already belongs here.
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={signOutAction}>
            <button
              className="inline-flex h-9 items-center rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              type="submit"
            >
              Use another account
            </button>
          </form>
          <Link
            className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            href="/"
          >
            Return home
          </Link>
        </div>
      </div>
    </AuthPageShell>
  );
}
