import Link from "next/link";
import { headers } from "next/headers";
import { SettingsShell } from "@/components/layout/settings-shell";
import {
  SettingsWorkspace,
  type SettingsSection,
} from "@/features/organization/components/settings-workspace";
import { getOrganizationSettingsData } from "@/features/organization/data";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { getOrganizationWorkspaceUrl } from "@/lib/auth/tenant";
import { canViewPilotResetContext } from "@/features/reset-maintenance/context";
import { PILOT_RESET_ORGANIZATION } from "@/features/reset-maintenance/review";

export async function OrganizationSettingsRoute({
  section,
}: {
  section: SettingsSection;
}) {
  const context = await requireSuperAdminContext();
  const data = await getOrganizationSettingsData(context.organizationId);
  const activeHref = `/settings/${section}`;
  const showResetReview = section === "organization" && context.organizationId === PILOT_RESET_ORGANIZATION &&
    canViewPilotResetContext(context, (await headers()).get("host"));

  return (
    <SettingsShell activeHref={activeHref} role={context.role}>
      <SettingsWorkspace
        appearance={data.appearance}
        branches={data.branches}
        canManageStructure
        logoStoragePath={data.logoStoragePath}
        logoUrl={data.logoUrl}
        organizationName={context.organizationName}
        organizationSlug={context.organizationSlug}
        section={section}
        staff={data.staff}
        teams={data.teams}
        workspaceSetup={data.workspaceSetup}
        workspaceUrl={getOrganizationWorkspaceUrl(
          context.organizationSlug,
          "/",
        )}
      />
      {showResetReview && <Link href="/settings/maintenance" prefetch={false}
        className="text-sm font-medium text-primary underline underline-offset-4">
        Review October reset
      </Link>}
    </SettingsShell>
  );
}
