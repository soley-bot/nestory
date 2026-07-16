"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Building2, Landmark, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import type { DraftStatus } from "@/components/ui/draft-action-bar";
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

export type SettingsSection = "organization" | "branches" | "teams";

const sections = [
  { icon: Landmark, label: "Organization", value: "organization" },
  { icon: Building2, label: "Branches", value: "branches" },
  { icon: UsersRound, label: "Teams", value: "teams" },
] as const;

type PendingNavigation = {
  href: string;
  label: string;
  mode: "dirty" | "saving";
  trigger: HTMLAnchorElement;
};

export function SettingsWorkspace({
  branches,
  canManageStructure,
  organizationName,
  organizationSlug,
  section,
  staff,
  teams,
}: {
  branches: OrganizationBranch[];
  canManageStructure: boolean;
  organizationName: string;
  organizationSlug?: string;
  section: SettingsSection;
  staff: OrganizationPersonOption[];
  teams: OrganizationTeam[];
}) {
  const router = useRouter();
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("clean");
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<SettingsEditorHandle>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    if (!pendingNavigation) {
      return;
    }

    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-navigation-guard-cancel]")
        ?.focus();
    });
  }, [pendingNavigation]);

  function handleSectionClick(
    event: MouseEvent<HTMLAnchorElement>,
    destination: (typeof sections)[number],
  ) {
    if (destination.value === section || draftStatus === "clean" || draftStatus === "saved") {
      return;
    }

    event.preventDefault();
    setPendingNavigation({
      href: `/settings?section=${destination.value}`,
      label: destination.label,
      mode: draftStatus === "saving" ? "saving" : "dirty",
      trigger: event.currentTarget,
    });
  }

  function keepEditing() {
    const trigger = pendingNavigation?.trigger;
    setPendingNavigation(undefined);
    if (trigger) {
      requestAnimationFrame(() => trigger.focus());
    }
  }

  function discardAndNavigate() {
    if (!pendingNavigation || pendingNavigation.mode !== "dirty") {
      return;
    }

    const href = pendingNavigation.href;
    editorRef.current?.discard();
    setPendingNavigation(undefined);
    router.push(href);
  }

  return (
    <main
      className="grid min-w-0 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start xl:grid-cols-[180px_minmax(0,1fr)_300px]"
      data-testid="settings-workspace"
    >
      <nav
        aria-label="Organization settings sections"
        className="flex min-w-0 gap-1 overflow-x-auto rounded-md border border-border bg-surface p-1 lg:row-span-2 lg:flex-col lg:overflow-visible"
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

      {pendingNavigation ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/20 p-4">
          <div
            aria-labelledby={dialogTitleId}
            aria-modal="true"
            className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-4 shadow-xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                keepEditing();
              }
            }}
            ref={dialogRef}
            role="dialog"
          >
            <h2 className="text-sm font-semibold text-foreground" id={dialogTitleId}>
              Open {pendingNavigation.label}?
            </h2>
            <p className="mt-2 text-sm text-foreground-muted">
              {pendingNavigation.mode === "saving"
                ? "A save is still in progress. Stay on this section until it finishes."
                : "This section has unsaved changes. Discard them before leaving."}
            </p>
            <div
              className="mt-4 grid gap-2 sm:flex sm:items-center sm:justify-end"
              data-testid="settings-navigation-actions"
            >
              <Button
                className="w-full sm:w-auto"
                data-navigation-guard-cancel
                onClick={keepEditing}
                variant="ghost"
              >
                Keep editing
              </Button>
              {pendingNavigation.mode === "dirty" ? (
                <Button
                  className="w-full sm:w-auto"
                  onClick={discardAndNavigate}
                  variant="primary"
                >
                  Discard and open {pendingNavigation.label}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {section === "organization" ? (
        <OrganizationIdentity
          branches={branches}
          organizationName={organizationName}
          organizationSlug={organizationSlug}
          teams={teams}
        />
      ) : section === "branches" ? (
        <BranchEditor
          branches={branches}
          canManageStructure={canManageStructure}
          onDraftStatusChange={setDraftStatus}
          organizationName={organizationName}
          ref={editorRef}
        />
      ) : (
        <TeamEditor
          branches={branches}
          canManageStructure={canManageStructure}
          onDraftStatusChange={setDraftStatus}
          organizationName={organizationName}
          ref={editorRef}
          staff={staff}
          teams={teams}
        />
      )}
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
    <>
      <section
        className="min-w-0 rounded-md border border-border bg-surface px-4 py-4"
        data-testid="settings-editor"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Organization identity
        </h2>
        <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
          <Fact label="Workspace" value={organizationName} />
          <Fact label="Subdomain" value={organizationSlug ?? "Not set"} />
          <Fact label="Branches" value={String(branches.length)} />
          <Fact label="Teams" value={String(teams.length)} />
        </dl>
      </section>
      <aside
        className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1"
        data-testid="settings-summary"
      >
        <ConsequencePanel
          rows={[
            { label: "Scope", value: organizationName },
            { label: "Branches", value: branches.length },
            { label: "Teams", value: teams.length },
            { label: "Draft", value: "Read only" },
          ]}
          summary="Organization identity is read-only here."
          title="Workspace scope"
        />
      </aside>
    </>
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
