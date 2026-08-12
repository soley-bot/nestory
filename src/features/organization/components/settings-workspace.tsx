"use client";

import { useEffect, useRef } from "react";
import {
  Building2,
  Landmark,
  Palette,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import {
  SettingsNavigationGuardProvider,
  useSettingsNavigationGuard,
} from "@/components/layout/settings-navigation-guard";
import { ConfigurationRegistryCatalog } from "@/features/configuration/components/configuration-registry-catalog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BranchEditor,
  type SettingsEditorHandle,
} from "@/features/organization/components/branch-editor";
import { TeamEditor } from "@/features/organization/components/team-editor";
import { AppearanceEditor } from "@/features/organization/components/appearance-editor";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
} from "@/features/organization/data";
import {
  DEFAULT_ORGANIZATION_THEME,
  type OrganizationTheme,
} from "@/lib/theme/organization-theme";

export type SettingsSection =
  "organization" | "appearance" | "configuration" | "branches" | "teams";

const sections = [
  { icon: Landmark, label: "Organization", value: "organization" },
  { icon: Palette, label: "Appearance", value: "appearance" },
  { icon: SlidersHorizontal, label: "Configuration", value: "configuration" },
  { icon: Building2, label: "Branches", value: "branches" },
  { icon: UsersRound, label: "Teams", value: "teams" },
] as const;

type SettingsWorkspaceProps = {
  appearance?: OrganizationTheme;
  branches: OrganizationBranch[];
  canManageStructure: boolean;
  organizationName: string;
  organizationSlug?: string;
  section: SettingsSection;
  staff: OrganizationPersonOption[];
  teams: OrganizationTeam[];
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
  organizationName,
  organizationSlug,
  section,
  staff,
  teams,
}: SettingsWorkspaceProps) {
  const guard = useSettingsNavigationGuard();
  const editorRef = useRef<SettingsEditorHandle>(null);
  const currentSection = sections.find((item) => item.value === section)!;

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
    <div
      className="min-w-0 px-4 py-4 sm:px-6"
      data-testid="settings-workspace"
    >
      <section
        aria-label={`${currentSection.label} settings content`}
        className="min-w-0"
        data-testid="settings-current-content"
        role="region"
      >
        {section === "organization" ? (
          <OrganizationIdentity
            branches={branches}
            organizationName={organizationName}
            organizationSlug={organizationSlug}
            teams={teams}
          />
        ) : section === "appearance" ? (
          <AppearanceEditor
            onDraftStatusChange={guard?.setDraftStatus ?? (() => undefined)}
            ref={editorRef}
            theme={appearance}
          />
        ) : section === "configuration" ? (
          <ConfigurationRegistryCatalog />
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

function OrganizationIdentity({
  branches,
  organizationName,
  organizationSlug,
  teams,
}: {
  branches: OrganizationBranch[];
  organizationName: string;
  organizationSlug?: string;
  teams: OrganizationTeam[];
}) {
  return (
    <Card data-testid="settings-editor" size="sm">
      <CardHeader className="border-b">
        <CardTitle>
          <h2>Organization</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border text-sm">
          <Fact label="Workspace" value={organizationName} />
          <Fact label="Subdomain" value={organizationSlug ?? "Not set"} />
          <Fact label="Branches" value={String(branches.length)} />
          <Fact label="Teams" value={String(teams.length)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
