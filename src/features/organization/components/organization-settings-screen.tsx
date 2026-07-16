import {
  SettingsWorkspace,
  type SettingsSection,
} from "@/features/organization/components/settings-workspace";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
} from "@/features/organization/data";

export function OrganizationSettingsScreen({
  branches,
  canManageStructure = true,
  organizationName,
  organizationSlug,
  section,
  staff,
  teams,
}: {
  branches: OrganizationBranch[];
  canManageStructure?: boolean;
  organizationName: string;
  organizationSlug?: string;
  section: SettingsSection;
  staff: OrganizationPersonOption[];
  teams: OrganizationTeam[];
}) {
  return (
    <SettingsWorkspace
      branches={branches}
      canManageStructure={canManageStructure}
      organizationName={organizationName}
      organizationSlug={organizationSlug}
      section={section}
      staff={staff}
      teams={teams}
    />
  );
}
