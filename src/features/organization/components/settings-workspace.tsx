"use client";

import { useEffect, useRef } from "react";
import {
  SettingsNavigationGuardProvider,
  useSettingsNavigationGuard,
} from "@/components/layout/settings-navigation-guard";
import {
  BranchEditor,
  type SettingsEditorHandle,
} from "@/features/organization/components/branch-editor";
import { TeamEditor } from "@/features/organization/components/team-editor";
import { AppearanceEditor } from "@/features/organization/components/appearance-editor";
import { OrganizationIdentityEditor } from "@/features/organization/components/organization-identity-editor";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
  OrganizationWorkspaceSetup,
} from "@/features/organization/data";
import {
  DEFAULT_ORGANIZATION_THEME,
  type OrganizationTheme,
} from "@/lib/theme/organization-theme";

export type SettingsSection =
  "organization" | "appearance" | "branches" | "teams";

const sectionLabels: Record<SettingsSection, string> = {
  appearance: "Appearance",
  branches: "Branches",
  organization: "Organization",
  teams: "Teams",
};

type SettingsWorkspaceProps = {
  appearance?: OrganizationTheme;
  branches: OrganizationBranch[];
  canManageStructure: boolean;
  logoStoragePath?: string | null;
  logoUrl?: string | null;
  organizationName: string;
  organizationSlug?: string;
  section: SettingsSection;
  staff: OrganizationPersonOption[];
  teams: OrganizationTeam[];
  workspaceSetup: OrganizationWorkspaceSetup;
  workspaceUrl?: string;
};

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const guard = useSettingsNavigationGuard();

  if (!guard) {
    return (
      <SettingsNavigationGuardProvider>
        <SettingsWorkspaceContent {...props} />
      </SettingsNavigationGuardProvider>
    );
  }

  return <SettingsWorkspaceContent {...props} />;
}

function SettingsWorkspaceContent({
  appearance = DEFAULT_ORGANIZATION_THEME,
  branches,
  canManageStructure,
  logoStoragePath = null,
  logoUrl = null,
  organizationName,
  organizationSlug,
  section,
  staff,
  teams,
  workspaceSetup,
  workspaceUrl,
}: SettingsWorkspaceProps) {
  const guard = useSettingsNavigationGuard();
  const editorRef = useRef<SettingsEditorHandle>(null);
  const currentSectionLabel = sectionLabels[section];

  useEffect(() => {
    if (!guard) {
      return undefined;
    }

    guard.registerDraftController({
      discard: () => editorRef.current?.discard(),
    });
    return () => guard.registerDraftController(null);
  }, [guard]);

  return (
    <div className="min-w-0" data-testid="settings-workspace">
      <section
        aria-label={`${currentSectionLabel} settings content`}
        className="min-w-0"
        data-testid="settings-current-content"
        role="region"
      >
        {section === "organization" ? (
          <OrganizationIdentityEditor
            branchCount={branches.length}
            onDraftStatusChange={guard?.setDraftStatus ?? (() => undefined)}
            organizationName={organizationName}
            organizationSlug={organizationSlug}
            ref={editorRef}
            teamCount={teams.length}
            workspaceSetup={workspaceSetup}
            workspaceUrl={workspaceUrl}
          />
        ) : section === "appearance" ? (
          <AppearanceEditor
            logoStoragePath={logoStoragePath}
            logoUrl={logoUrl}
            onDraftStatusChange={guard?.setDraftStatus ?? (() => undefined)}
            organizationName={organizationName}
            ref={editorRef}
            theme={appearance}
          />
        ) : section === "branches" ? (
          <BranchEditor
            branches={branches}
            canManageStructure={canManageStructure}
            focusServerError={!guard?.suppressErrorFocus}
            onDraftStatusChange={guard?.setDraftStatus ?? (() => undefined)}
            organizationName={organizationName}
            ref={editorRef}
          />
        ) : (
          <TeamEditor
            branches={branches}
            canManageStructure={canManageStructure}
            focusServerError={!guard?.suppressErrorFocus}
            onDraftStatusChange={guard?.setDraftStatus ?? (() => undefined)}
            organizationName={organizationName}
            ref={editorRef}
            staff={staff}
            teams={teams}
          />
        )}
      </section>
    </div>
  );
}
