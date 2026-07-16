import { redirect } from "next/navigation";
import {
  getCurrentOrganizationSlug,
  getWorkspaceMembershipForUser,
  requireUser,
} from "@/lib/auth/context";
import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";
import { signOutAction } from "@/features/auth/actions";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { SetupOrganizationForm } from "@/features/auth/components/setup-organization-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await requireUser();
  const rootDomain = process.env.APP_ROOT_DOMAIN ?? "nestory-kh.com";
  const organizationSlug = await getCurrentOrganizationSlug();
  const membership = await getWorkspaceMembershipForUser(user.id, undefined, {
    organizationSlug,
  });

  if (membership) {
    redirect(WORKSPACE_ENTRY_PATH);
  }

  if (organizationSlug) {
    redirect("/no-access");
  }

  return (
    <AuthPageShell
      contextLabel="Workspace setup"
      contextText="Name the workspace and choose the address your team will use."
      contextTitle="Start with a clean operating base."
      description="Choose the workspace name and address."
      title="Set up workspace"
      visualSrc="/marketing/login-property-building-blue-hour.png"
    >
      <div>
        <p className="text-sm leading-6 text-foreground-muted">{user.email}</p>
        <SetupOrganizationForm rootDomain={rootDomain} />
        <form action={signOutAction} className="mt-5 border-t border-border pt-4">
          <button
            className="text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    </AuthPageShell>
  );
}
