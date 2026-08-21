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
  OrganizationWorkspaceSetup,
} from "@/features/organization/data";
import type { OrganizationTheme } from "@/lib/theme/organization-theme";

export function OrganizationSettingsScreen({
  appearance,
  branches,
  canManageStructure = true,
  header,
  logoStoragePath = null,
  logoUrl = null,
  organizationName,
  organizationSlug,
  section,
  staff,
  teams,
  workspaceSetup,
  workspaceUrl,
}: {
  appearance?: OrganizationTheme;
  branches: OrganizationBranch[];
  canManageStructure?: boolean;
  header?: ReactNode;
  logoStoragePath?: string | null;
  logoUrl?: string | null;
  organizationName: string;
  organizationSlug?: string;
  section: SettingsSection;
  staff: OrganizationPersonOption[];
  teams: OrganizationTeam[];
  workspaceSetup: OrganizationWorkspaceSetup;
  workspaceUrl?: string;
}) {
  return (
    <SettingsNavigationGuardProvider>
      <WorkspacePage header={header ?? <SettingsTabs activeHref="/settings" />}>
        <SettingsWorkspace
          appearance={appearance}
          branches={branches}
          canManageStructure={canManageStructure}
          logoStoragePath={logoStoragePath}
          logoUrl={logoUrl}
          organizationName={organizationName}
          organizationSlug={organizationSlug}
          section={section}
          staff={staff}
          teams={teams}
          workspaceSetup={workspaceSetup}
          workspaceUrl={workspaceUrl}
        />
      </WorkspacePage>
    </SettingsNavigationGuardProvider>
  );
}
