"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { Building2, Landmark, SlidersHorizontal, UsersRound } from "lucide-react";
import {
  SettingsNavigationGuardProvider,
  useSettingsNavigationGuard,
} from "@/components/layout/settings-navigation-guard";
import { ConfigurationRegistryCatalog } from "@/features/configuration/components/configuration-registry-catalog";
import {
  BranchEditor,
  type SettingsEditorHandle,
} from "@/features/organization/components/branch-editor";
import { TeamEditor } from "@/features/organization/components/team-editor";
import type {
  OrganizationBranch,
  OrganizationPersonOption,
  OrganizationTeam,
} from "@/features/organization/data";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "organization"
  | "configuration"
  | "branches"
  | "teams";

const sections = [
  { icon: Landmark, label: "Organization", value: "organization" },
  { icon: SlidersHorizontal, label: "Configuration", value: "configuration" },
  { icon: Building2, label: "Branches", value: "branches" },
  { icon: UsersRound, label: "Teams", value: "teams" },
] as const;

type SettingsWorkspaceProps = {
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
    <main
      className="grid min-w-0 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start"
      data-testid="settings-workspace"
    >
      <nav
        aria-label="Organization settings sections"
        className="flex min-w-0 gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:border-r lg:border-border lg:pb-0 lg:pr-4"
      >
        {sections.map((item) => {
          const current = item.value === section;
          const Icon = item.icon;
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-[13px] font-medium text-foreground-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring lg:w-full",
                current && "bg-accent-soft text-foreground",
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
    </main>
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
    <section className="min-w-0" data-testid="settings-editor">
      <h2 className="text-sm font-semibold text-foreground">
        Organization identity
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Organization identity is read-only here.
      </p>
      <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
        <Fact label="Workspace" value={organizationName} />
        <Fact label="Subdomain" value={organizationSlug ?? "Not set"} />
        <Fact label="Branches" value={String(branches.length)} />
        <Fact label="Teams" value={String(teams.length)} />
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 py-3">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
