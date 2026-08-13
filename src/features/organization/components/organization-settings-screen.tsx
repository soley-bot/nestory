"use client";

import type { ReactNode } from "react";
import { SettingsNavigationGuardProvider } from "@/components/layout/settings-navigation-guard";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  SettingsWorkspace,
  type SettingsSection,
} from "@/features/organization/components/settings-workspace";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
} from "@/features/organization/data";
import type { OrganizationTheme } from "@/lib/theme/organization-theme";

export function OrganizationSettingsScreen({
  appearance,
  branches,
  canManageStructure = true,
  header,
  organizationName,
  organizationSlug,
  section,
  staff,
  teams,
}: {
  appearance?: OrganizationTheme;
  branches: OrganizationBranch[];
  canManageStructure?: boolean;
  header?: ReactNode;
  organizationName: string;
  organizationSlug?: string;
  section: SettingsSection;
  staff: OrganizationPersonOption[];
  teams: OrganizationTeam[];
}) {
  return (
    <SettingsNavigationGuardProvider>
      <WorkspacePage header={header ?? <SettingsTabs activeHref="/settings" />}>
        <SettingsWorkspace
          appearance={appearance}
          branches={branches}
          canManageStructure={canManageStructure}
          organizationName={organizationName}
          organizationSlug={organizationSlug}
          section={section}
          staff={staff}
          teams={teams}
        />
      </WorkspacePage>
    </SettingsNavigationGuardProvider>
  );
}
