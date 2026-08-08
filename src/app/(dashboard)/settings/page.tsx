import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { OrganizationSettingsScreen } from "@/features/organization/components/organization-settings-screen";
import type { SettingsSection } from "@/features/organization/components/settings-workspace";
import { getOrganizationSettingsData } from "@/features/organization/data";
import { requireSuperAdminContext } from "@/lib/auth/context";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const context = await requireSuperAdminContext();
  const params = await searchParams;
  const data = await getOrganizationSettingsData(context.organizationId);

  return (
    <OrganizationSettingsScreen
      branches={data.branches}
      canManageStructure={context.role === "super_admin"}
      header={
        <PageHeader
          className="px-3 py-3 sm:px-4 lg:px-5 lg:py-3"
          navigation={<SettingsTabs activeHref="/settings" />}
          title="Settings"
        />
      }
      organizationName={context.organizationName}
      organizationSlug={context.organizationSlug}
      section={readSection(params.section)}
      staff={data.staff}
      teams={data.teams}
    />
  );
}

function readSection(value: string | string[] | undefined): SettingsSection {
  const section = Array.isArray(value) ? value[0] : value;
  return section === "branches" ||
    section === "teams" ||
    section === "configuration"
    ? section
    : "organization";
}
