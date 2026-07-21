"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus, UsersRound } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SideDrawer } from "@/components/ui/side-drawer";
import { removeActionSearchParam as getHrefWithoutActionParam } from "@/lib/url/href";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import {
  ArchivePersonPanel,
  RestorePersonPanel,
} from "@/features/people/components/person-drawer-panels";
import { PersonForm } from "@/features/people/components/person-form";
import { PeopleCommandCenter } from "@/features/people/components/people-command-center";
import { PeopleFilters } from "@/features/people/components/people-filters";
import { PeopleTable } from "@/features/people/components/people-table";
import { PeopleWorkspaceNavigation } from "@/features/people/components/people-workspace-navigation";
import { formatRole } from "@/features/people/people.labels";
import type { PeopleInsights } from "@/features/people/people.insights";
import type {
  PeopleDisplayMode,
  PeoplePagination,
  PeopleSummary,
  PeopleViewQuery,
  PersonRoleValue,
} from "@/features/people/people.types";

type DrawerState =
  | { mode: "create"; person?: never }
  | { mode: "edit"; person: PeopleSummary }
  | { mode: "archive"; person: PeopleSummary }
  | { mode: "restore"; person: PeopleSummary };

type PeopleScreenProps = {
  accessByPersonId?: Record<string, OrganizationPersonAccessStatus>;
  addButtonLabel?: string;
  canCreate?: boolean;
  createRole?: PersonRoleValue;
  description?: string;
  initialPersonId?: string;
  insights?: PeopleInsights;
  localNavigation?: ReactNode;
  lockedRole?: PersonRoleValue;
  pagination: PeoplePagination;
  people: PeopleSummary[];
  searchPlaceholder?: string;
  title?: string;
  viewQuery: PeopleViewQuery;
};

export function PeopleScreen({
  addButtonLabel = "Add person",
  canCreate = true,
  createRole,
  initialPersonId,
  insights,
  localNavigation,
  lockedRole,
  pagination,
  people,
  searchPlaceholder,
  title = "People",
  viewQuery,
}: PeopleScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    canCreate && searchParams.get("action") === "create"
      ? { mode: "create" }
      : null,
  );
  const [displayMode, setDisplayMode] = useState<PeopleDisplayMode>("table");
  const isTableMode = displayMode === "table";
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const focusedPerson = initialPersonId
    ? people.find((person) => person.id === initialPersonId) ?? null
    : null;
  const focusedPersonId = focusedPerson?.id;
  const reviewContext = getPeopleReviewContext(viewQuery, {
    hasFocusedPerson: Boolean(focusedPerson),
    hasFocusedPersonIntent: Boolean(initialPersonId),
  });
  const moduleRole = lockedRole ?? createRole;
  const openPeopleAction = (nextDrawer: DrawerState) => {
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };

  useEffect(() => {
    if (!focusedPersonId) {
      return;
    }

    router.replace(`/people/${focusedPersonId}`, { scroll: false });
  }, [focusedPersonId, router]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    if (!canCreate) {
      router.replace(getHrefWithoutActionParam(pathname, searchParams), {
        scroll: false,
      });
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawer({ mode: "create" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [canCreate, pathname, router, searchParams]);

  const hasFilters = hasActivePeopleFilters(viewQuery, lockedRole);
  const peopleList = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      {people.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                href={pathname}
                scroll={false}
              >
                Clear filters
              </Link>
            ) : canCreate ? (
              <Button onClick={() => openPeopleAction({ mode: "create" })} variant="primary">
                <Plus size={15} />
                {addButtonLabel}
              </Button>
            ) : undefined
          }
          body={hasFilters ? "No records match the active People filters." : "No people records are available in this workspace."}
          className="h-full"
          icon={UsersRound}
          kind={hasFilters ? "filtered" : "empty"}
          prominent={!hasFilters}
          title={hasFilters ? "No matching people" : "No people yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <PeopleTable
              archiveState={viewQuery.archiveState}
              displayMode={displayMode}
              people={people}
              roleContext={lockedRole}
            />
          </div>
          <PaginationControls attached={isTableMode} pagination={pagination} />
        </>
      )}
    </section>
  );
  return (
    <WorkspacePage
      actions={
        <>
            {canCreate ? (
              <Button
                onClick={() => openPeopleAction({ mode: "create" })}
                variant="primary"
              >
                <Plus size={15} />
                {addButtonLabel}
              </Button>
            ) : null}
        </>
      }
      context={`${pagination.totalCount} ${pagination.totalCount === 1 ? "record" : "records"}`}
      contextHref={pathname}
      localNav={
        localNavigation ?? (
          <PeopleWorkspaceNavigation activeRole={lockedRole} />
        )
      }
      toolbar={<PeopleFilters
        displayMode={displayMode}
        lockedRole={lockedRole}
        onDisplayModeChange={setDisplayMode}
        searchPlaceholder={searchPlaceholder}
        viewQuery={viewQuery}
      />}
      title={title}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">

      {statusMessage ? (
        <div className="shrink-0 px-4 py-2 sm:px-6">
          <div
            className="flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
            <p className="font-medium text-foreground">{statusMessage}</p>
          </div>
        </div>
      ) : null}

      {insights ? (
        <PeopleCommandCenter insights={insights} />
      ) : null}

      {reviewContext ? (
        <PeopleReviewStrip context={reviewContext} count={pagination.totalCount} />
      ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          {peopleList}
        </div>
      </div>

      {drawer ? (
        <SideDrawer
          description={getPeopleDrawerDescription(drawer, moduleRole)}
          onClose={() => setDrawer(null)}
          open
          title={getPeopleDrawerTitle(drawer, moduleRole)}
        >
          {drawer.mode === "archive" ? (
            <ArchivePersonPanel
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              person={drawer.person}
            />
          ) : drawer.mode === "restore" ? (
            <RestorePersonPanel
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              person={drawer.person}
            />
          ) : (
            <PersonForm
              key={`${drawer.mode}-${drawer.person?.id ?? "new"}`}
              initialRoles={
                drawer.mode === "create" && createRole ? [createRole] : undefined
              }
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              person={drawer.person}
              roleContext={moduleRole}
            />
          )}
        </SideDrawer>
      ) : null}
    </WorkspacePage>
  );
}

type PeopleReviewContext = {
  countLabel: string;
  description: string;
  nextStep: string;
};

type FocusedPeopleState = {
  hasFocusedPerson: boolean;
  hasFocusedPersonIntent: boolean;
};

function PeopleReviewStrip({
  context,
  count,
}: {
  context: PeopleReviewContext;
  count: number;
}) {
  return (
    <div className="border-b border-border bg-warning-soft/20 px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-1 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "person" : "people"} {context.countLabel}
        </p>
        <p className="text-foreground-muted">{context.nextStep}</p>
      </div>
    </div>
  );
}

function getPeopleReviewContext(
  viewQuery: PeopleViewQuery,
  focusedState: FocusedPeopleState,
): PeopleReviewContext | null {
  if (focusedState.hasFocusedPerson) {
    return {
      countLabel: "in this activity view",
      description: "Opened from recent activity with archived records included.",
      nextStep: "Focused person ready for review.",
    };
  }

  if (focusedState.hasFocusedPersonIntent) {
    return {
      countLabel: "in this activity view",
      description:
        "Opened from recent activity with archived records included, but this page did not include the focused person.",
      nextStep: "Review visible matches or broaden the current filters.",
    };
  }

  if (viewQuery.status === "missing_contact") {
    return {
      countLabel: "missing usable contact",
      description:
        "Showing people records that need a usable email or phone before tenant, owner, vendor, or staff follow-up.",
      nextStep: "Add a usable email or phone in Edit.",
    };
  }

  if (viewQuery.status === "no_role") {
    return {
      countLabel: "without an assigned role",
      description:
        "Showing people records that need a tenant, owner, vendor, or staff role before they can drive linked workflows.",
      nextStep: "Assign the operating role in Edit.",
    };
  }

  return null;
}

function hasActivePeopleFilters(
  viewQuery: PeopleViewQuery,
  lockedRole?: PersonRoleValue,
) {
  return (
    viewQuery.query.trim().length > 0 ||
    (viewQuery.role !== "all" && !lockedRole) ||
    viewQuery.status !== "all" ||
    viewQuery.archiveState !== "active" ||
    viewQuery.sort !== "name_asc" ||
    viewQuery.pageSize !== 50
  );
}

function getPeopleDrawerTitle(
  drawer: DrawerState,
  roleContext?: PersonRoleValue,
) {
  const label = roleContext ? formatRole(roleContext).toLowerCase() : "person";

  if (drawer.mode === "create") {
    return `Add ${label}`;
  }

  if (drawer.mode === "edit") {
    return `Edit ${label} record`;
  }

  if (drawer.mode === "restore") {
    return `Restore ${label} record`;
  }

  return `Archive ${label} record`;
}

function getPeopleDrawerDescription(
  drawer: DrawerState,
  roleContext?: PersonRoleValue,
) {
  if (roleContext) {
    return getRoleDrawerDescription(drawer.mode, roleContext);
  }

  if (drawer.mode === "create") {
    return "Create a durable person or company record for tenant, owner, vendor, or staff work.";
  }

  if (drawer.mode === "edit") {
    return "Update the directory profile and active role assignments.";
  }

  if (drawer.mode === "restore") {
    return "Return this person to normal operational views.";
  }

  return "Hide this person from active operational views without deleting linked history.";
}

function getRoleDrawerDescription(
  mode: DrawerState["mode"],
  role: PersonRoleValue,
) {
  const record = `${formatRole(role).toLowerCase()} record`;

  if (mode === "create") {
    if (role === "staff") {
      return "Create a staff record for task assignment and access binding.";
    }

    if (role === "tenant") {
      return "Create a tenant record for leases, occupancy, and follow-up.";
    }

    if (role === "owner") {
      return "Create an owner record for property ownership and reporting.";
    }

    return "Create a vendor record for service work and maintenance links.";
  }

  if (mode === "edit") {
    return `Update contact and operating details for this ${record}.`;
  }

  if (mode === "restore") {
    return `Return this ${record} to active People workflows.`;
  }

  return `Archive this ${record} without losing linked history.`;
}
