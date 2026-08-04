"use client";

import type { ReactNode } from "react";
import { SettingsNavigationGuardProvider } from "@/components/layout/settings-navigation-guard";
import { SettingsTabs } from "@/components/layout/settings-tabs";
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
  header,
  organizationName,
  organizationSlug,
  section,
  staff,
  teams,
}: {
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
      {header ?? <SettingsTabs activeHref="/settings" />}
      <SettingsWorkspace
        branches={branches}
        canManageStructure={canManageStructure}
        organizationName={organizationName}
        organizationSlug={organizationSlug}
        section={section}
        staff={staff}
        teams={teams}
      />
    </SettingsNavigationGuardProvider>
  );
}
