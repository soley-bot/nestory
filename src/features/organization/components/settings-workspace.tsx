"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
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
import { cn } from "@/lib/utils";

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

  function handleSectionClick(
    event: MouseEvent<HTMLAnchorElement>,
    destination: (typeof sections)[number],
  ) {
    if (!guard || destination.value === section) {
      return;
    }

    guard.handleNavigationClick(event, {
      href: `/settings?section=${destination.value}`,
      label: destination.label,
    });
  }

  return (
    <div
      className="mx-auto grid w-full max-w-6xl min-w-0 gap-3 px-3 py-3 sm:px-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start"
      data-testid="settings-workspace"
    >
      <nav
        aria-label="Organization settings sections"
        className="flex min-w-0 gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 lg:flex-col lg:overflow-visible"
      >
        {sections.map((item) => {
          const current = item.value === section;
          const Icon = item.icon;
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2 rounded-md border border-transparent px-2.5 text-xs font-medium text-muted-foreground outline-none transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 lg:w-full",
                current &&
                  "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30",
              )}
              href={`/settings?section=${item.value}`}
              key={item.value}
              onClick={(event) => handleSectionClick(event, item)}
              prefetch={false}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

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
