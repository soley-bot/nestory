"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
import { SideDrawer } from "@/components/ui/side-drawer";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import {
  ArchivePersonPanel,
  RestorePersonPanel,
} from "@/features/people/components/person-drawer-panels";
import { PersonForm } from "@/features/people/components/person-form";
import { PeopleFilters } from "@/features/people/components/people-filters";
import { PeopleInspector } from "@/features/people/components/people-inspector";
import { PeopleTable } from "@/features/people/components/people-table";
import { formatRole } from "@/features/people/people.labels";
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
  createRole?: PersonRoleValue;
  description?: string;
  initialPersonId?: string;
  lockedRole?: PersonRoleValue;
  pagination: PeoplePagination;
  people: PeopleSummary[];
  searchPlaceholder?: string;
  title?: string;
  viewQuery: PeopleViewQuery;
};

export function PeopleScreen({
  accessByPersonId,
  addButtonLabel = "Add person",
  createRole,
  description = "Operational people, company, tenant, owner, vendor, and staff records linked back to the work they support.",
  initialPersonId,
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
    searchParams.get("action") === "create" ? { mode: "create" } : null,
  );
  const [displayMode, setDisplayMode] = useState<PeopleDisplayMode>("table");
  const isTableMode = displayMode === "table";
  const [selectedPersonId, setSelectedPersonId] = useState(() =>
    getInitialRecordId(people, initialPersonId),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const focusedPerson = initialPersonId
    ? people.find((person) => person.id === initialPersonId) ?? null
    : null;
  const focusedPersonId = focusedPerson?.id;
  const selectedPerson = getSelectedRecord({
    focusedRecordId: initialPersonId,
    records: people,
    selectedRecordId: selectedPersonId,
  });
  const reviewContext = getPeopleReviewContext(viewQuery, {
    hasFocusedPerson: Boolean(focusedPerson),
    hasFocusedPersonIntent: Boolean(initialPersonId),
  });
  const moduleRole = lockedRole ?? createRole;
  const getPersonRecordHref = (personId: string) => `/people/${personId}`;
  const openPersonRecord = (personId: string) => {
    router.push(getPersonRecordHref(personId), { scroll: false });
  };
  const openPeopleAction = (nextDrawer: DrawerState) => {
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewPerson = (personId: string) => {
    setSelectedPersonId(personId);
    setPreviewOpen(!usesPersistentInspector());
  };

  useEffect(() => {
    if (!focusedPersonId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedPersonId(focusedPersonId);
      setPreviewOpen(!usesPersistentInspector());
    });
  }, [focusedPersonId]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawer({ mode: "create" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  return (
    <div className="min-h-screen lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
      <PageHeader
        actions={
          <>
            {reviewContext && selectedPerson ? (
              <Button
                onClick={() =>
                  openPeopleAction({ mode: "edit", person: selectedPerson })
                }
              >
                <Pencil size={15} />
                Edit selected
              </Button>
            ) : null}
            <Button
              onClick={() => openPeopleAction({ mode: "create" })}
              variant="primary"
            >
              <Plus size={15} />
              {addButtonLabel}
            </Button>
          </>
        }
        description={
          reviewContext
            ? reviewContext.description
            : description
        }
        title={title}
      />

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-6">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <PeopleFilters
        displayMode={displayMode}
        lockedRole={lockedRole}
        onDisplayModeChange={setDisplayMode}
        searchPlaceholder={searchPlaceholder}
        viewQuery={viewQuery}
      />

      {reviewContext ? (
        <PeopleReviewStrip context={reviewContext} count={pagination.totalCount} />
      ) : null}

      <div className="px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:px-6 lg:py-4">
        <div className="grid min-h-0 items-stretch gap-3 lg:h-full xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-[13px]">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {getPeopleListTitle(moduleRole)}
                </p>
                <p className="text-foreground-muted">
                  Select a row to inspect. Double-click to open the full relationship file.
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-muted">
                {pagination.totalCount} total
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <PeopleTable
                archiveState={viewQuery.archiveState}
                displayMode={displayMode}
                onOpenPerson={openPersonRecord}
                onSelectPerson={previewPerson}
                people={people}
                roleContext={lockedRole}
                selectedPersonId={selectedPerson?.id ?? ""}
              />
            </div>
            <PaginationControls attached={isTableMode} pagination={pagination} />
          </section>
          <aside className="hidden min-h-0 overflow-y-auto rounded-md border border-border bg-surface xl:block">
            <PeopleInspector
              onArchivePerson={(person) =>
                openPeopleAction({ mode: "archive", person })
              }
              onEditPerson={(person) => openPeopleAction({ mode: "edit", person })}
              onRestorePerson={(person) =>
                openPeopleAction({ mode: "restore", person })
              }
              getPersonHref={getPersonRecordHref}
              accessStatus={
                selectedPerson ? accessByPersonId?.[selectedPerson.id] : undefined
              }
              person={selectedPerson}
              showAccessStatus={moduleRole === "staff"}
            />
          </aside>
        </div>
      </div>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedPerson)}
        title="Person preview"
      >
        <PeopleInspector
          onArchivePerson={(person) =>
            openPeopleAction({ mode: "archive", person })
          }
          onEditPerson={(person) => openPeopleAction({ mode: "edit", person })}
          onRestorePerson={(person) =>
            openPeopleAction({ mode: "restore", person })
          }
          getPersonHref={getPersonRecordHref}
          accessStatus={
            selectedPerson ? accessByPersonId?.[selectedPerson.id] : undefined
          }
          person={selectedPerson}
          showAccessStatus={moduleRole === "staff"}
        />
      </RecordPreviewDrawer>

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
    </div>
  );
}

function getHrefWithoutActionParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("action");

  const queryString = nextParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
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
      nextStep: "The focused person is selected for inspector review.",
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
      nextStep: "Select a person, then edit contact details from the header or inspector.",
    };
  }

  if (viewQuery.status === "no_role") {
    return {
      countLabel: "without an assigned role",
      description:
        "Showing people records that need a tenant, owner, vendor, or staff role before they can drive linked workflows.",
      nextStep: "Select a person, then assign the right role from the edit drawer.",
    };
  }

  return null;
}

function getPeopleListTitle(role?: PersonRoleValue) {
  if (role === "tenant") {
    return "Tenant records";
  }

  if (role === "owner") {
    return "Owner records";
  }

  if (role === "vendor") {
    return "Vendor records";
  }

  if (role === "staff") {
    return "Staff records";
  }

  return "People records";
}

function usesPersistentInspector() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1280px)").matches
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
