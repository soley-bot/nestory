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
      contextItems={[
        {
          label: "Identity",
          text: "Name the company record your portfolio belongs to.",
        },
        {
          label: "Address",
          text: "Choose the workspace URL before property data moves in.",
        },
        {
          label: "First run",
          text: "Add a property, import units, or open the overview next.",
        },
      ]}
      contextLabel="Workspace setup"
      contextText="Nestory creates one admin workspace first. Property records, rent, maintenance, and documents attach to it after setup."
      contextTitle="Start with a clean operating base."
      description="Create the admin workspace and choose the address your team will use."
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
