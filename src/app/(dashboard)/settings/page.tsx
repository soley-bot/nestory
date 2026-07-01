import { PageHeader } from "@/components/layout/page-header";
import { OrganizationSettingsScreen } from "@/features/organization/components/organization-settings-screen";
import { getOrganizationSettingsData } from "@/features/organization/data";
import { requireWorkspaceContext } from "@/lib/auth/context";

export default async function SettingsPage() {
  const context = await requireWorkspaceContext();
  const data = await getOrganizationSettingsData(context.organizationId);

  return (
    <div>
      <PageHeader
        description="Branches, teams, and the real-world company structure."
        title="Organization"
      />
      <OrganizationSettingsScreen
        branches={data.branches}
        organizationName={context.organizationName}
        staff={data.staff}
        teams={data.teams}
      />
    </div>
  );
}
