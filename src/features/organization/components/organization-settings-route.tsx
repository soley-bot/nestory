import { SettingsShell } from "@/components/layout/settings-shell";
import {
  SettingsWorkspace,
  type SettingsSection,
} from "@/features/organization/components/settings-workspace";
import { getOrganizationSettingsData } from "@/features/organization/data";
import { requireSuperAdminContext } from "@/lib/auth/context";

type CanonicalOrganizationSection = Exclude<SettingsSection, "configuration">;

export async function OrganizationSettingsRoute({
  section,
}: {
  section: CanonicalOrganizationSection;
}) {
  const context = await requireSuperAdminContext();
  const data = await getOrganizationSettingsData(context.organizationId);
  const activeHref = `/settings/${section}`;

  return (
    <SettingsShell activeHref={activeHref} role={context.role}>
      <SettingsWorkspace
        appearance={data.appearance}
        branches={data.branches}
        canManageStructure
        organizationName={context.organizationName}
        organizationSlug={context.organizationSlug}
        section={section}
        staff={data.staff}
        teams={data.teams}
      />
    </SettingsShell>
  );
}
