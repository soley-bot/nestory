"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  ArchivePersonPanel,
  RestorePersonPanel,
} from "@/features/people/components/person-drawer-panels";
import { PersonForm } from "@/features/people/components/person-form";
import { PeopleFilters } from "@/features/people/components/people-filters";
import { PeopleInspector } from "@/features/people/components/people-inspector";
import { PeopleTable } from "@/features/people/components/people-table";
import type {
  PeopleDisplayMode,
  PeoplePagination,
  PeopleSummary,
  PeopleViewQuery,
} from "@/features/people/people.types";

type DrawerState =
  | { mode: "create"; person?: never }
  | { mode: "edit"; person: PeopleSummary }
  | { mode: "archive"; person: PeopleSummary }
  | { mode: "restore"; person: PeopleSummary };

type PeopleScreenProps = {
  initialPersonId?: string;
  pagination: PeoplePagination;
  people: PeopleSummary[];
  viewQuery: PeopleViewQuery;
};

export function PeopleScreen({
  initialPersonId,
  pagination,
  people,
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
  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) ??
    focusedPerson ??
    people[0] ??
    null;
  const reviewContext = getPeopleReviewContext(viewQuery, {
    hasFocusedPerson: Boolean(focusedPerson),
    hasFocusedPersonIntent: Boolean(initialPersonId),
  });
  const getPersonRecordHref = (personId: string) =>
    getFocusedRecordHref(pathname, searchParams, "personId", personId);
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
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!focusedPersonId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedPersonId(focusedPersonId);
      setPreviewOpen(true);
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
    <div className="min-h-screen">
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
              Add person
            </Button>
          </>
        }
        description={
          reviewContext
            ? reviewContext.description
            : "Operational people, company, tenant, owner, and vendor records linked back to leases and properties."
        }
        title="People"
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
        onDisplayModeChange={setDisplayMode}
        viewQuery={viewQuery}
      />

      {reviewContext ? (
        <PeopleReviewStrip context={reviewContext} count={pagination.totalCount} />
      ) : null}

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div
          className={isTableMode ? "min-w-0 space-y-0" : "min-w-0 space-y-3"}
        >
          <PeopleTable
            archiveState={viewQuery.archiveState}
            displayMode={displayMode}
            getPersonHref={getPersonRecordHref}
            onOpenPerson={openPersonRecord}
            onSelectPerson={previewPerson}
            people={people}
            selectedPersonId={selectedPerson?.id ?? ""}
          />
          <PaginationControls attached={isTableMode} pagination={pagination} />
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
          person={selectedPerson}
        />
      </RecordPreviewDrawer>

      {drawer ? (
        <SideDrawer
          description={getPeopleDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getPeopleDrawerTitle(drawer)}
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
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              person={drawer.person}
            />
          )}
        </SideDrawer>
      ) : null}
    </div>
  );
}

function getInitialRecordId<TRecord extends { id: string }>(
  records: TRecord[],
  initialId?: string,
) {
  return initialId && records.some((record) => record.id === initialId)
    ? initialId
    : records[0]?.id ?? "";
}

function getFocusedRecordHref(
  pathname: string,
  searchParams: { toString(): string },
  key: string,
  value: string,
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.set(key, value);

  return `${pathname}?${nextParams.toString()}`;
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
        "Showing people records that need a usable email or phone before tenant, owner, or vendor follow-up.",
      nextStep: "Select a person, then edit contact details from the header or inspector.",
    };
  }

  if (viewQuery.status === "no_role") {
    return {
      countLabel: "without an assigned role",
      description:
        "Showing people records that need a tenant, owner, or vendor role before they can drive linked workflows.",
      nextStep: "Select a person, then assign the right role from the edit drawer.",
    };
  }

  return null;
}

function getPeopleDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Add person";
  }

  if (drawer.mode === "edit") {
    return "Edit person";
  }

  if (drawer.mode === "restore") {
    return "Restore person";
  }

  return "Archive person";
}

function getPeopleDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create a durable person or company record for tenant, owner, or vendor work.";
  }

  if (drawer.mode === "edit") {
    return "Update the directory profile and active role assignments.";
  }

  if (drawer.mode === "restore") {
    return "Return this person to normal operational views.";
  }

  return "Hide this person from active operational views without deleting linked history.";
}
