import Link from "next/link";
import {
  Archive,
  BriefcaseBusiness,
  Building2,
  ExternalLink,
  FileText,
  Mail,
  Pencil,
  Phone,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRole } from "@/features/people/people.labels";
import type { PeopleSummary } from "@/features/people/people.types";

type PeopleInspectorProps = {
  onArchivePerson: (person: PeopleSummary) => void;
  onEditPerson: (person: PeopleSummary) => void;
  onRestorePerson: (person: PeopleSummary) => void;
  person: PeopleSummary | null;
};

export function PeopleInspector({
  onArchivePerson,
  onEditPerson,
  onRestorePerson,
  person,
}: PeopleInspectorProps) {
  if (!person) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4 2xl:sticky 2xl:top-5">
        <div className="flex items-center gap-2">
          <UserRound className="text-muted" size={16} />
          <h2 className="text-base font-semibold">People inspector</h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Select a person to inspect roles, contact details, lease links,
          ownership, vendor profile, and notes.
        </p>
      </aside>
    );
  }

  const iconButtonClassName =
    "inline-flex h-9 items-center justify-center rounded-md border border-border font-medium text-foreground transition-colors hover:bg-surface-muted";
  const primaryIconButtonClassName =
    "inline-flex h-9 items-center justify-center rounded-md border border-accent bg-accent text-white transition-colors hover:bg-[#16181d]";

  return (
    <aside className="rounded-md border border-border bg-surface 2xl:sticky 2xl:top-5 2xl:max-h-[calc(100vh-170px)] 2xl:overflow-auto">
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
        <section>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Roles
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {person.roles.length > 0 ? (
              person.roles.map((role) => (
                <Badge
                  key={`${role.role}-${role.status}`}
                  tone={role.status === "active" ? "accent" : "neutral"}
                >
                  {formatRole(role.role)}
                </Badge>
              ))
            ) : (
              <Badge tone="warning">No role</Badge>
            )}
          </div>
        </section>

        <dl className="grid grid-cols-1 gap-3 text-sm">
          <IconDetail
            icon={<Mail size={15} />}
            label="Email"
            value={person.contact.email ?? "No email"}
          />
          <IconDetail
            icon={<Phone size={15} />}
            label="Phone"
            value={person.contact.phone ?? "No phone"}
          />
          {person.formValues.taxIdentifier ? (
            <IconDetail
              icon={<FileText size={15} />}
              label="Tax"
              value={person.formValues.taxIdentifier}
            />
          ) : null}
        </dl>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <BriefcaseBusiness size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              Linked records
            </p>
          </div>
          <div className="mt-3 space-y-3 text-sm">
            <LinkedLease person={person} />
            <LinkedOwnerProperty person={person} />
            <LinkedVendor person={person} />
          </div>
        </section>

        <section>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Notes
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
            {person.notes || "No notes yet."}
          </p>
        </section>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <Link
            aria-label={`Open leases filtered to ${person.displayName}`}
            className={iconButtonClassName}
            href={`/leases?query=${encodeURIComponent(person.displayName)}`}
            title="Open related leases"
          >
            <ExternalLink size={15} />
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
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      </div>
    </aside>
  );
}

function IconDetail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 gap-2">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
          {label}
        </dt>
        <dd className="mt-1 break-words font-medium">{value}</dd>
      </div>
    </div>
  );
}

function LinkedLease({ person }: { person: PeopleSummary }) {
  if (!person.linked.activeLease) {
    return <LinkedEmpty label="Lease" value="No active lease link" />;
  }

  const lease = person.linked.activeLease;

  return (
    <LinkedBlock
      icon={<FileText size={14} />}
      label={`${person.linked.activeLeaseCount} active lease${
        person.linked.activeLeaseCount === 1 ? "" : "s"
      }`}
      value={`${lease.unitLabel} / ${lease.propertyLabel}`}
    />
  );
}

function LinkedOwnerProperty({ person }: { person: PeopleSummary }) {
  if (!person.linked.ownerProperty) {
    return <LinkedEmpty label="Ownership" value="No property ownership" />;
  }

  const property = person.linked.ownerProperty;

  return (
    <Link
      className="block rounded-md border border-border bg-surface px-2.5 py-2 transition-colors hover:bg-surface-muted"
      href={`/properties/${property.id}`}
      title="Open owned property"
    >
      <LinkedBlock
        icon={<Building2 size={14} />}
        label={`${person.linked.ownerPropertyCount} owner propert${
          person.linked.ownerPropertyCount === 1 ? "y" : "ies"
        }`}
        value={`${property.ownershipLabel} / ${property.label}`}
      />
    </Link>
  );
}

function LinkedVendor({ person }: { person: PeopleSummary }) {
  if (!person.linked.vendorProfile) {
    return <LinkedEmpty label="Vendor" value="No vendor profile" />;
  }

  const vendor = person.linked.vendorProfile;

  return (
    <LinkedBlock
      icon={<BriefcaseBusiness size={14} />}
      label={vendor.preferred ? "Preferred vendor" : "Vendor"}
      value={`${vendor.label} / ${vendor.status}`}
    />
  );
}

function LinkedBlock({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 gap-2">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="truncate font-medium">{label}</p>
        <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-muted">
          {value}
        </p>
      </div>
    </div>
  );
}

function LinkedEmpty({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{value}</p>
    </div>
  );
}
