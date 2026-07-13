import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { OrganizationSettingsScreen } from "@/features/organization/components/organization-settings-screen";
import { getOrganizationSettingsData } from "@/features/organization/data";
import { requireAdminContext } from "@/lib/auth/context";

export default async function SettingsPage() {
  const context = await requireAdminContext();
  const data = await getOrganizationSettingsData(context.organizationId);

  return (
    <div>
      <PageHeader
        description="Configure workspace structure, access, module defaults, and system controls."
        title="Settings"
      />
      <SettingsTabs activeHref="/settings" />
      <OrganizationSettingsScreen
        branches={data.branches}
        organizationName={context.organizationName}
        organizationSlug={context.organizationSlug}
        staff={data.staff}
        teams={data.teams}
      />
    </div>
  );
}
