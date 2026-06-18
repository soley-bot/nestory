"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
  pagination: PeoplePagination;
  people: PeopleSummary[];
  schemaNotice?: string;
  viewQuery: PeopleViewQuery;
};

export function PeopleScreen({
  pagination,
  people,
  schemaNotice,
  viewQuery,
}: PeopleScreenProps) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [displayMode, setDisplayMode] = useState<PeopleDisplayMode>("table");
  const [selectedPersonId, setSelectedPersonId] = useState(people[0]?.id ?? "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) ?? people[0] ?? null;

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setStatusMessage(null);
              setDrawer({ mode: "create" });
            }}
            variant="primary"
          >
            <Plus size={15} />
            Add person
          </Button>
        }
        description="Operational people, company, tenant, owner, and vendor records linked back to leases and properties."
        title="People"
      />

      {statusMessage || schemaNotice ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-8">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={schemaNotice ? "alert" : "status"}
          >
            {statusMessage ?? schemaNotice}
          </p>
        </div>
      ) : null}

      <PeopleFilters
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        viewQuery={viewQuery}
      />

      <div className="space-y-3 px-4 py-5 sm:px-6 lg:p-8">
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <PeopleTable
              archiveState={viewQuery.archiveState}
              displayMode={displayMode}
              onArchivePerson={(person) => {
                setStatusMessage(null);
                setDrawer({ mode: "archive", person });
              }}
              onEditPerson={(person) => {
                setStatusMessage(null);
                setDrawer({ mode: "edit", person });
              }}
              onRestorePerson={(person) => {
                setStatusMessage(null);
                setDrawer({ mode: "restore", person });
              }}
              onSelectPerson={setSelectedPersonId}
              people={people}
              schemaNotice={schemaNotice}
              selectedPersonId={selectedPerson?.id ?? ""}
            />
            <PaginationControls pagination={pagination} />
          </div>
          <PeopleInspector
            onArchivePerson={(person) => {
              setStatusMessage(null);
              setDrawer({ mode: "archive", person });
            }}
            onEditPerson={(person) => {
              setStatusMessage(null);
              setDrawer({ mode: "edit", person });
            }}
            onRestorePerson={(person) => {
              setStatusMessage(null);
              setDrawer({ mode: "restore", person });
            }}
            person={selectedPerson}
          />
        </div>
      </div>

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
