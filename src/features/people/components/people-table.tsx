import Link from "next/link";
import { ArrowUpRight, Building2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import { WorkspaceAccessStatus } from "@/features/people/components/workspace-access-status";
import {
  getPeopleLinkedLabel,
  getPeopleOperatingContext,
} from "@/features/people/people.context";
import { formatRole } from "@/features/people/people.labels";
import type {
  PeopleArchiveState,
  PeopleDisplayMode,
  PeopleSummary,
  PersonRoleSummary,
  PersonRoleValue,
} from "@/features/people/people.types";
import { cn } from "@/lib/utils";

type PeopleTableProps = {
  accessByPersonId?: Record<string, OrganizationPersonAccessStatus>;
  archiveState: PeopleArchiveState;
  displayMode: PeopleDisplayMode;
  people: PeopleSummary[];
  roleContext?: PersonRoleValue;
};

export function PeopleTable({
  accessByPersonId,
  archiveState,
  displayMode,
  people,
  roleContext,
}: PeopleTableProps) {
  const emptyMessage = getEmptyMessage(archiveState);
  const isRoleScoped = Boolean(roleContext);

  return (
    <div className="min-w-0">
      <div
        className={cn(
          displayMode === "cards"
            ? "grid auto-rows-max content-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3"
            : "space-y-3 md:hidden",
        )}
      >
        {people.length === 0 ? (
          <p className="rounded-md border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
            {emptyMessage}
          </p>
        ) : null}
        {people.map((person) => (
          <PersonCard
            accessStatus={accessByPersonId?.[person.id]}
            key={person.id}
            person={person}
            roleContext={roleContext}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div className="hidden min-w-0 md:block" data-slot="people-table-frame">
          <div
            aria-label="People table"
            className="overflow-x-auto"
            role="region"
          >
            <table className="w-full min-w-[840px] table-fixed border-collapse text-left text-sm">
              {isRoleScoped ? (
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[22%]" />
                  <col className="w-[14%]" />
                  <col className="w-[24%]" />
                  <col className="w-[18%]" />
                </colgroup>
              ) : (
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[12%]" />
                  <col className="w-[22%]" />
                  <col className="w-[14%]" />
                  <col className="w-[20%]" />
                  <col className="w-[10%]" />
                </colgroup>
              )}
              <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
                {isRoleScoped ? (
                  <tr>
                    <th className="px-2.5 py-2.5 font-semibold">
                      {getPersonHeader(roleContext)}
                    </th>
                    <th className="px-1.5 py-2.5 font-semibold">Email</th>
                    <th className="px-1.5 py-2.5 font-semibold">Phone</th>
                    <th className="px-1.5 py-2.5 font-semibold">
                      {getContextHeader(roleContext)}
                    </th>
                    <th className="px-1.5 py-2.5 font-semibold">
                      {roleContext === "staff" ? "Workspace Access" : "Status"}
                    </th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-2.5 py-2.5 font-semibold">Person</th>
                    <th className="px-1.5 py-2.5 font-semibold">Roles</th>
                    <th className="px-1.5 py-2.5 font-semibold">Email</th>
                    <th className="px-1.5 py-2.5 font-semibold">Phone</th>
                    <th className="px-1.5 py-2.5 font-semibold">Linked</th>
                    <th className="px-1.5 py-2.5 text-center font-semibold">
                      Status
                    </th>
                  </tr>
                )}
              </thead>
              <tbody>
                {people.length === 0 ? (
                  <tr className="border-t border-border">
                    <td
                      className="px-4 py-8 text-center text-muted-foreground"
                      colSpan={isRoleScoped ? 5 : 6}
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : null}
                {people.map((person) => {
                  const secondaryName = getSecondaryName(person);

                  return (
                    <tr
                      className={cn(
                        "border-t border-border transition-colors hover:bg-muted/50",
                        person.isArchived && "text-muted-foreground",
                      )}
                      key={person.id}
                    >
                      <td className="px-2.5 py-2">
                        <div className="min-w-0">
                          <Link
                            className="block truncate rounded-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            href={`/people/${person.id}`}
                            onClick={(event) => event.stopPropagation()}
                            prefetch={false}
                            title={person.displayName}
                          >
                            {person.displayName}
                          </Link>
                          {secondaryName ? (
                            <p
                              className="mt-0.5 truncate text-xs text-muted-foreground"
                              title={secondaryName}
                            >
                              {secondaryName}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      {isRoleScoped ? null : (
                        <td className="px-1.5 py-2">
                          <RoleBadges roles={person.roles} />
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <EmailCell person={person} />
                      </td>
                      <td className="px-2 py-2">
                        <PhoneCell person={person} />
                      </td>
                      <td className="px-2 py-2">
                        <ContextCell
                          person={person}
                          roleContext={roleContext}
                        />
                      </td>
                      {isRoleScoped ? (
                        <td className="px-2 py-2">
                          {roleContext === "staff" ? (
                            canManageWorkspaceAccess(person) &&
                            accessByPersonId?.[person.id] ? (
                              <WorkspaceAccessStatus
                                personId={person.id}
                                personName={person.displayName}
                                status={accessByPersonId[person.id]}
                              />
                            ) : (
                              <WorkspaceAccessUnavailable />
                            )
                          ) : (
                            <StatusCell person={person} />
                          )}
                        </td>
                      ) : (
                        <td className="px-1.5 py-2">
                          <StatusBadges compact person={person} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PersonCard({
  accessStatus,
  person,
  roleContext,
}: {
  accessStatus?: OrganizationPersonAccessStatus;
  person: PeopleSummary;
  roleContext?: PersonRoleValue;
}) {
  return (
    <article
      className={cn(
        "group min-w-0 overflow-hidden rounded-md border border-border bg-card text-sm transition-colors hover:border-record-spine",
        person.isArchived && "text-muted-foreground",
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-3.5 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          {person.partyType === "company" ? (
            <Building2 size={18} />
          ) : (
            <UserRound size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                className="block truncate rounded-sm text-sm font-semibold leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/people/${person.id}`}
                prefetch={false}
                title={person.displayName}
              >
                {person.displayName}
              </Link>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {person.legalName ?? person.partyTypeLabel}
              </p>
            </div>
            <StatusBadges person={person} />
          </div>
          <div className="mt-3">
            <RoleBadges roles={person.roles} />
          </div>
        </div>
      </div>
      <div className="border-t border-border px-3.5 py-2.5 text-sm">
        <CardMetric
          label={getContextHeader(roleContext)}
          value={getContextValue(person, roleContext)}
        />
        {roleContext === "staff" ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Workspace Access
            </p>
            {canManageWorkspaceAccess(person) && accessStatus ? (
              <WorkspaceAccessStatus
                personId={person.id}
                personName={person.displayName}
                status={accessStatus}
              />
            ) : (
              <WorkspaceAccessUnavailable />
            )}
          </div>
        ) : null}
        <Link
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          href={`/people/${person.id}`}
          prefetch={false}
        >
          Open record
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </article>
  );
}

function ContextCell({
  person,
  roleContext,
}: {
  person: PeopleSummary;
  roleContext?: PersonRoleValue;
}) {
  if (roleContext === "staff") {
    const context = getPeopleOperatingContext(person);

    return (
      <p className="line-clamp-2 break-words font-medium" title={context}>
        {context}
      </p>
    );
  }

  const label = getLinkedLabel(person);
  const detail = getLinkedDetail(person);

  return (
    <div className="min-w-0 space-y-0.5">
      <p className="line-clamp-1 break-words font-medium" title={label}>
        {label}
      </p>
      <p
        className="line-clamp-1 break-words text-xs text-muted-foreground"
        title={detail}
      >
        {detail}
      </p>
    </div>
  );
}

/**
 * The legal name only earns a second line when it says something the display
 * name does not. "Mara Sovan / Mara Sovan" and "Dara Chan / Chan Dara" are the
 * same name; "Bright Mekong Trading Co., Ltd." is not.
 */
function getSecondaryName(person: PeopleSummary) {
  const legalName = person.legalName?.trim();

  if (!legalName) {
    return null;
  }

  const words = (value: string) =>
    value.toLowerCase().split(/\s+/).filter(Boolean).sort().join(" ");

  return words(legalName) === words(person.displayName) ? null : legalName;
}

function EmailCell({ person }: { person: PeopleSummary }) {
  if (!person.contact.email) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }

  return (
    <p className="truncate" title={person.contact.email}>
      {person.contact.email}
    </p>
  );
}

function PhoneCell({ person }: { person: PeopleSummary }) {
  if (!person.contact.phone) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }

  return (
    <p className="truncate tabular-nums" title={person.contact.phone}>
      {person.contact.phone}
    </p>
  );
}

function StatusCell({ person }: { person: PeopleSummary }) {
  return (
    <Badge className="max-w-full px-2 text-xs" tone={person.statusTone}>
      {person.statusLabel}
    </Badge>
  );
}

function WorkspaceAccessUnavailable() {
  return (
    <p className="text-xs font-medium text-muted-foreground">
      Workspace access unavailable
    </p>
  );
}

function canManageWorkspaceAccess(person: PeopleSummary) {
  return (
    !person.isArchived &&
    person.roles.some(
      (role) => role.role === "staff" && role.status === "active",
    )
  );
}

function RoleBadges({
  className,
  roles,
}: {
  className?: string;
  roles: PersonRoleSummary[];
}) {
  if (roles.length === 0) {
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        <Badge className="px-2 text-xs" tone="warning">
          No role
        </Badge>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {roles.map((role) => (
        <Badge
          className="px-2 text-xs"
          key={`${role.role}-${role.status}`}
          tone={role.status === "active" ? "accent" : "neutral"}
        >
          {formatRole(role.role)}
        </Badge>
      ))}
    </div>
  );
}

function StatusBadges({
  compact = false,
  person,
}: {
  compact?: boolean;
  person: PeopleSummary;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap gap-1.5",
        compact && "justify-center",
      )}
    >
      <Badge
        className={compact ? "px-2 text-xs" : undefined}
        tone={person.statusTone}
      >
        {person.statusLabel}
      </Badge>
    </div>
  );
}

function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-medium">{value}</p>
    </div>
  );
}

function getLinkedLabel(person: PeopleSummary) {
  return getPeopleLinkedLabel(person) ?? "No linked records";
}

function getContextValue(person: PeopleSummary, roleContext?: PersonRoleValue) {
  return roleContext === "staff"
    ? getPeopleOperatingContext(person)
    : getLinkedLabel(person);
}

function getLinkedDetail(person: PeopleSummary) {
  if (person.linked.activeLease) {
    return `${person.linked.activeLease.unitLabel} / ${person.linked.activeLease.propertyLabel}`;
  }

  if (person.linked.ownerProperty) {
    return `${person.linked.ownerProperty.ownershipLabel} / ${person.linked.ownerProperty.label}`;
  }

  if (person.linked.vendorProfile) {
    return person.linked.vendorProfile.preferred
      ? "Preferred vendor"
      : person.linked.vendorProfile.status;
  }

  return person.notes ?? person.partyTypeLabel;
}

function getPersonHeader(roleContext?: PersonRoleValue) {
  if (roleContext === "tenant") {
    return "Tenant";
  }

  if (roleContext === "owner") {
    return "Owner";
  }

  if (roleContext === "vendor") {
    return "Vendor";
  }

  if (roleContext === "staff") {
    return "Staff";
  }

  return "Person";
}

function getContextHeader(roleContext?: PersonRoleValue) {
  if (roleContext === "tenant") {
    return "Lease / Unit";
  }

  if (roleContext === "owner") {
    return "Ownership";
  }

  if (roleContext === "vendor") {
    return "Service / Coverage";
  }

  if (roleContext === "staff") {
    return "Operating context";
  }

  return "Linked";
}

function getEmptyMessage(archiveState: PeopleArchiveState) {
  if (archiveState === "archived") {
    return "No archived people.";
  }

  if (archiveState === "all") {
    return "No people yet.";
  }

  return "No active people yet.";
}
