import { PageHeader } from "@/components/layout/page-header";
import { OrganizationSettingsScreen } from "@/features/organization/components/organization-settings-screen";
import type { SettingsSection } from "@/features/organization/components/settings-workspace";
import { getOrganizationSettingsData } from "@/features/organization/data";
import { requireAdminContext } from "@/lib/auth/context";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const data = await getOrganizationSettingsData(context.organizationId);

  return (
    <div>
      <PageHeader
        description="Organization structure and workspace access."
        title="Settings"
      />
      <OrganizationSettingsScreen
        branches={data.branches}
        canManageStructure={context.role === "admin"}
        organizationName={context.organizationName}
        organizationSlug={context.organizationSlug}
        section={readSection(params.section)}
        staff={data.staff}
        teams={data.teams}
      />
    </div>
  );
}

function readSection(value: string | string[] | undefined): SettingsSection {
  const section = Array.isArray(value) ? value[0] : value;
  return section === "branches" || section === "teams" ? section : "organization";
}
