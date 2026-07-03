import { Building2, UserRound } from "lucide-react";
import {
  previewRowClassName,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";
import { Badge } from "@/components/ui/badge";
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
  archiveState: PeopleArchiveState;
  displayMode: PeopleDisplayMode;
  onOpenPerson: (id: string) => void;
  onSelectPerson: (id: string) => void;
  people: PeopleSummary[];
  roleContext?: PersonRoleValue;
  selectedPersonId: string;
};

export function PeopleTable({
  archiveState,
  displayMode,
  onOpenPerson,
  onSelectPerson,
  people,
  roleContext,
  selectedPersonId,
}: PeopleTableProps) {
  const emptyMessage = getEmptyMessage(archiveState);
  const isRoleScoped = Boolean(roleContext);

  return (
    <div className="h-full min-h-0">
      <div
        className={cn(
          displayMode === "cards"
            ? "grid h-full min-h-[380px] auto-rows-max content-start gap-3 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3"
            : "h-full min-h-[380px] space-y-3 overflow-auto pr-1 md:hidden",
        )}
      >
        {people.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted sm:col-span-2 xl:col-span-3">
            {emptyMessage}
          </p>
        ) : null}
        {people.map((person) => (
          <PersonCard
            key={person.id}
            onOpenPerson={onOpenPerson}
            onSelectPerson={onSelectPerson}
            person={person}
            selected={selectedPersonId === person.id}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div className="hidden h-full min-h-[380px] overflow-hidden rounded-md border border-border bg-surface md:block">
          <div className="h-full overflow-auto">
            <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-[13px]">
              {isRoleScoped ? (
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[22%]" />
                  <col className="w-[15%]" />
                  <col className="w-[24%]" />
                  <col className="w-[13%]" />
                </colgroup>
              ) : (
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[11%]" />
                  <col className="w-[20%]" />
                  <col className="w-[14%]" />
                  <col className="w-[23%]" />
                  <col className="w-[8%]" />
                </colgroup>
              )}
              <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
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
                    <th className="px-1.5 py-2.5 font-semibold">Next</th>
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
                      className="px-4 py-8 text-center text-muted"
                      colSpan={isRoleScoped ? 5 : 6}
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : null}
                {people.map((person) => (
                  <tr
                    className={cn(
                      previewRowClassName,
                      selectedPersonId === person.id &&
                        selectedPreviewRowClassName,
                      person.isArchived && "text-muted",
                    )}
                    key={person.id}
                    onClick={() => onSelectPerson(person.id)}
                    onDoubleClick={() => onOpenPerson(person.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectPerson(person.id);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-2.5 py-2">
                      <div className="min-w-0">
                        <p
                          className="truncate font-semibold text-foreground"
                          title={person.displayName}
                        >
                          {person.displayName}
                        </p>
                        <p
                          className="mt-0.5 truncate text-xs text-muted"
                          title={person.legalName ?? person.partyTypeLabel}
                        >
                          {person.legalName ?? person.partyTypeLabel}
                        </p>
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
                      <LinkedCell person={person} />
                    </td>
                    {isRoleScoped ? (
                      <td className="px-2 py-2">
                        <NextActionCell person={person} />
                      </td>
                    ) : (
                      <td className="px-1.5 py-2">
                        <StatusBadges compact person={person} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PersonCard({
  onOpenPerson,
  onSelectPerson,
  person,
  selected,
}: {
  onOpenPerson: (id: string) => void;
  onSelectPerson: (id: string) => void;
  person: PeopleSummary;
  selected: boolean;
}) {
  return (
    <article
      className={cn(
        "group min-w-0 cursor-pointer overflow-hidden rounded-md border border-border bg-surface text-sm transition-colors hover:border-[#c9d0da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        selected && "border-accent shadow-[0_0_0_1px_var(--accent)]",
        person.isArchived && "text-muted",
      )}
      onClick={() => onSelectPerson(person.id)}
      onDoubleClick={() => onOpenPerson(person.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectPerson(person.id);
        }
      }}
      tabIndex={0}
    >
      <div className="flex items-start gap-3 border-b border-border px-3.5 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-muted">
          {person.partyType === "company" ? (
            <Building2 size={18} />
          ) : (
            <UserRound size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="truncate text-base font-semibold leading-5 text-foreground"
                title={person.displayName}
              >
                {person.displayName}
              </p>
              <p className="mt-1 truncate text-xs text-muted">
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
        <CardMetric label="Linked" value={getLinkedLabel(person)} />
      </div>
    </article>
  );
}

function LinkedCell({ person }: { person: PeopleSummary }) {
  const label = getLinkedLabel(person);
  const detail = getLinkedDetail(person);

  return (
    <div className="min-w-0 space-y-0.5">
      <p className="line-clamp-1 break-words font-medium" title={label}>
        {label}
      </p>
      <p className="line-clamp-1 break-words text-xs text-muted" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function EmailCell({ person }: { person: PeopleSummary }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p
        className={cn(
          "truncate font-medium",
          !person.contact.email && "text-warning",
        )}
        title={person.contact.email ?? "No email"}
      >
        {person.contact.email ?? "No email"}
      </p>
      <p className="truncate text-xs text-muted">
        {person.contact.email ? "Email on file" : "Needs email"}
      </p>
    </div>
  );
}

function PhoneCell({ person }: { person: PeopleSummary }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p
        className={cn(
          "truncate font-medium",
          !person.contact.phone && "text-warning",
        )}
        title={person.contact.phone ?? "No phone"}
      >
        {person.contact.phone ?? "No phone"}
      </p>
      <p className="truncate text-xs text-muted">
        {person.contact.phone ? "Phone on file" : "Needs phone"}
      </p>
    </div>
  );
}

function NextActionCell({ person }: { person: PeopleSummary }) {
  return (
    <div className="min-w-0 space-y-1">
      <Badge className="max-w-full px-2 text-xs" tone={person.nextAction.tone}>
        <span className="truncate">{person.nextAction.label}</span>
      </Badge>
      <p className="line-clamp-1 text-xs text-muted" title={person.nextAction.description}>
        {person.nextAction.description}
      </p>
    </div>
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
      <Badge className={compact ? "px-2 text-xs" : undefined} tone={person.statusTone}>
        {person.statusLabel}
      </Badge>
    </div>
  );
}

function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 truncate font-medium">{value}</p>
    </div>
  );
}

function getLinkedLabel(person: PeopleSummary) {
  if (person.linked.activeLease) {
    return `${person.linked.activeLeaseCount} active lease${
      person.linked.activeLeaseCount === 1 ? "" : "s"
    }`;
  }

  if (person.linked.ownerProperty) {
    return `${person.linked.ownerPropertyCount} owner propert${
      person.linked.ownerPropertyCount === 1 ? "y" : "ies"
    }`;
  }

  if (person.linked.vendorProfile) {
    return person.linked.vendorProfile.label;
  }

  return "No linked records";
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
    return "Team context";
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
