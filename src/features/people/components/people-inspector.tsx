import Link from "next/link";
import {
  Archive,
  ExternalLink,
  FileText,
  Pencil,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import { getPeopleOperatingContext } from "@/features/people/people.context";
import { formatRole } from "@/features/people/people.labels";
import type { PeopleSummary } from "@/features/people/people.types";

type PeopleInspectorProps = {
  accessStatus?: OrganizationPersonAccessStatus;
  getPersonHref: (id: string) => string;
  onArchivePerson: (person: PeopleSummary) => void;
  onEditPerson: (person: PeopleSummary) => void;
  onRestorePerson: (person: PeopleSummary) => void;
  person: PeopleSummary | null;
  showAccessStatus?: boolean;
};

export function PeopleInspector({
  accessStatus,
  getPersonHref,
  onArchivePerson,
  onEditPerson,
  onRestorePerson,
  person,
  showAccessStatus = false,
}: PeopleInspectorProps) {
  if (!person) {
    return null;
  }

  const iconButtonClassName =
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring";
  const primaryIconButtonClassName =
    "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 text-sm text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring";

  return (
    <div className="bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
              {person.partyTypeLabel}
            </p>
            <h2 className="mt-1 break-words text-base font-semibold">
              {person.displayName}
            </h2>
            {person.legalName ? (
              <p className="mt-1 break-words text-sm text-muted">
                {person.legalName}
              </p>
            ) : null}
          </div>
          <Badge tone={person.statusTone}>{person.statusLabel}</Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <CompactFact label="Roles">
            {person.roles.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {person.roles.slice(0, 2).map((role) => (
                  <Badge
                    key={`${role.role}-${role.status}`}
                    tone={role.status === "active" ? "accent" : "neutral"}
                  >
                    {formatRole(role.role)}
                  </Badge>
                ))}
              </div>
            ) : (
              <Badge tone="warning">No role</Badge>
            )}
          </CompactFact>
          <CompactFact label="Contact">
            <span className="line-clamp-2 break-words">
              {getContactLabel(person)}
            </span>
          </CompactFact>
          <CompactFact
            label={showAccessStatus ? "Operating context" : "Relationship"}
            wide
          >
            <span className="line-clamp-2 break-words">
              {showAccessStatus
                ? getPeopleOperatingContext(person)
                : getRelationshipLabel(person)}
            </span>
          </CompactFact>
        </div>

        <AttentionNote
          href={person.nextAction.href}
          item={getAttentionItem(person.riskIndicators)}
          fallbackLabel={person.nextAction.label}
        />

        {showAccessStatus ? (
          <AccessStatusNote accessStatus={accessStatus} person={person} />
        ) : null}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Link
            aria-label={`Open ${person.displayName}`}
            className={iconButtonClassName}
            href={getPersonHref(person.id)}
            prefetch={false}
            title="Open person"
          >
            <ExternalLink size={15} />
            <span className="truncate">Open person</span>
          </Link>
          <Link
            aria-label={`Open leases filtered to ${person.displayName}`}
            className={iconButtonClassName}
            href={person.hrefs.leases}
            title="Open related leases"
          >
            <FileText size={15} />
            <span className="truncate">Leases</span>
          </Link>
          {person.isArchived ? (
            <button
              aria-label={`Restore ${person.displayName}`}
              className={primaryIconButtonClassName}
              onClick={() => onRestorePerson(person)}
              title="Restore person"
              type="button"
            >
              <RotateCcw size={15} />
              <span className="truncate">Restore</span>
            </button>
          ) : (
            <button
              aria-label={`Edit ${person.displayName}`}
              className={iconButtonClassName}
              onClick={() => onEditPerson(person)}
              title="Edit person"
              type="button"
            >
              <Pencil size={15} />
              <span className="truncate">Edit</span>
            </button>
          )}
          {!person.isArchived ? (
            <button
              aria-label={`Archive ${person.displayName}`}
              className={`${iconButtonClassName} text-danger hover:text-danger`}
              onClick={() => onArchivePerson(person)}
              title="Archive person"
              type="button"
            >
              <Archive size={15} />
              <span className="truncate">Archive</span>
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

function AccessStatusNote({
  accessStatus,
  person,
}: {
  accessStatus?: OrganizationPersonAccessStatus;
  person: PeopleSummary;
}) {
  if (accessStatus) {
    return (
      <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
        <p className="text-sm font-semibold">Login access</p>
        <p className="mt-1 truncate text-xs text-muted">
          {formatAccessRole(accessStatus.role)}
          {accessStatus.email ? ` / ${accessStatus.email}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">No login access</p>
          <p className="mt-1 truncate text-xs text-muted">
            Staff record only.
          </p>
        </div>
        <Link
          aria-label={`Add login access for ${person.displayName}`}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
          href={getInviteHref(person)}
        >
          <UserPlus size={15} />
          <span className="hidden sm:inline">Add user</span>
        </Link>
      </div>
    </div>
  );
}

function getInviteHref(person: PeopleSummary) {
  const params = new URLSearchParams({ personId: person.id });

  if (person.contact.email) {
    params.set("email", person.contact.email);
  }

  return `/users-roles?${params.toString()}`;
}

function formatAccessRole(role: OrganizationPersonAccessStatus["role"]) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "manager") {
    return "Manager";
  }

  return "Member";
}

function CompactFact({
  children,
  label,
  wide = false,
}: {
  children: React.ReactNode;
  label: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0 rounded-md border border-border px-3 py-2.5" : "min-w-0 rounded-md border border-border px-3 py-2.5"}>
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium">{children}</div>
    </div>
  );
}

function AttentionNote({
  fallbackLabel,
  href,
  item,
}: {
  fallbackLabel: string;
  href: string;
  item?: PeopleSummary["riskIndicators"][number];
}) {
  const label = item?.label ?? fallbackLabel;

  return (
    <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold">{label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={item?.tone ?? "neutral"}>
            {item ? getRiskBadgeLabel(item.tone) : "Action"}
          </Badge>
          {item ? null : (
            <Link
              aria-label="Open action"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-accent transition-colors hover:bg-surface-muted"
              href={href}
              title="Open action"
            >
              <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function getRiskBadgeLabel(tone: PeopleSummary["riskIndicators"][number]["tone"]) {
  if (tone === "success") {
    return "Ready";
  }

  if (tone === "danger") {
    return "Risk";
  }

  return "Review";
}

function getAttentionItem(items: PeopleSummary["riskIndicators"]) {
  return items.find((item) => item.tone !== "success");
}

function getContactLabel(person: PeopleSummary) {
  if (person.contact.email && person.contact.phone) {
    return `${person.contact.email} / ${person.contact.phone}`;
  }

  return person.contact.email ?? person.contact.phone ?? "No contact";
}

function getRelationshipLabel(person: PeopleSummary) {
  if (person.linked.activeLease) {
    return `${person.linked.activeLease.unitLabel} / ${person.linked.activeLease.propertyLabel}`;
  }

  if (person.linked.ownerProperty) {
    return `${person.linked.ownerProperty.ownershipLabel} / ${person.linked.ownerProperty.label}`;
  }

  if (person.linked.vendorProfile) {
    return person.linked.vendorProfile.label;
  }

  return "No linked records";
}
