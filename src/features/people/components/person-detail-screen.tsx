"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Pencil,
  RotateCcw,
  ScrollText,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import { TransientFeedback } from "@/components/ui/transient-feedback";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import {
  ArchivePersonPanel,
  RestorePersonPanel,
} from "@/features/people/components/person-drawer-panels";
import { PersonForm } from "@/features/people/components/person-form";
import { WorkspaceAccessStatus } from "@/features/people/components/workspace-access-status";
import { formatRole } from "@/features/people/people.labels";
import type {
  PeopleBadgeTone,
  PeopleLeaseLink,
  PeoplePropertyLink,
  PeopleSummary,
} from "@/features/people/people.types";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";

type DrawerState =
  | { mode: "edit"; person: PeopleSummary }
  | { mode: "archive"; person: PeopleSummary }
  | { mode: "restore"; person: PeopleSummary };

type PersonRecordSection =
  | "overview"
  | "links"
  | "photos"
  | "documents"
  | "timeline";

const personRecordSections: Array<{
  id: PersonRecordSection;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "links", label: "Links" },
  { id: "photos", label: "Photos" },
  { id: "documents", label: "Documents" },
  { id: "timeline", label: "Timeline" },
];

export function PersonDetailScreen({
  accessStatus,
  person,
}: {
  accessStatus?: OrganizationPersonAccessStatus;
  person: PeopleSummary;
}) {
  const [activeSection, setActiveSection] =
    useState<PersonRecordSection>("overview");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const showWorkspaceAccess =
    Boolean(accessStatus) &&
    !person.isArchived &&
    person.roles.some(
      (role) => role.role === "staff" && role.status === "active",
    );

  return (
    <div className="lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <PageHeader
        actions={
          person.isArchived ? (
            <Button
              onClick={() => {
                setStatusMessage(null);
                setDrawer({ mode: "restore", person });
              }}
              variant="default"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <>
              <Link
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-primary px-2.5 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={person.nextAction.href}
                prefetch={false}
              >
                {person.nextAction.label}
                <ArrowRight size={14} />
              </Link>
              <Button
                onClick={() => {
                  setStatusMessage(null);
                  setDrawer({ mode: "edit", person });
                }}
              >
                <Pencil size={15} />
                Edit
              </Button>
              <Button
                onClick={() => {
                  setStatusMessage(null);
                  setDrawer({ mode: "archive", person });
                }}
              >
                <Archive size={15} />
                Archive
              </Button>
            </>
          )
        }
        breadcrumb={
          <PageBreadcrumb
            current={person.displayName}
            items={[
              { href: getBackHref(person), label: getBackLabel(person) },
            ]}
          />
        }
        context={
          <div className="flex items-center gap-2">
            <Badge tone={person.statusTone}>{person.statusLabel}</Badge>
            {person.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        }
        description={`${person.roleLabel} / ${person.partyTypeLabel}`}
        title={person.displayName}
      />

      {statusMessage ? (
        <TransientFeedback
          message={statusMessage}
          onDismiss={() => setStatusMessage(null)}
        />
      ) : null}

      <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-6 lg:py-4">
        <PersonRecordNav
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        <div
          aria-label="Person record details"
          className="min-h-0 flex-1 overflow-auto pr-1"
          role="region"
          tabIndex={0}
        >
          <div className="space-y-3">
            <PersonRecordPanel
              active={activeSection === "overview"}
              ariaLabelledBy="person-tab-overview"
              className="min-w-0 py-1"
              id="person-overview"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-base font-semibold">
                      Contact and relationships
                    </h2>
                  </div>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {person.legalName ?? person.partyTypeLabel}
                  </p>

                  <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                    <Detail label="Roles" value={person.roleLabel}>
                      <UserRound size={14} />
                    </Detail>
                    <Detail
                      label="Email"
                      tone={person.contact.email ? undefined : "warning"}
                      value={person.contact.email ?? "No email"}
                    />
                    <Detail
                      label="Phone"
                      tone={person.contact.phone ? undefined : "warning"}
                      value={person.contact.phone ?? "No phone"}
                    />
                    <Detail label="Linked" value={getLinkedSummary(person)} />
                    <Detail
                      label="Documents"
                      value={String(person.recordCounts.documents)}
                    />
                    <Detail
                      label="Updated"
                      value={formatDate(person.updatedAt)}
                    />
                  </dl>

                  {person.notes ? (
                    <div className="mt-4 rounded-md border border-border bg-muted/60 p-3 text-sm">
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                        Notes
                      </p>
                      <p className="mt-1 break-words">{person.notes}</p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {person.riskIndicators.map((item) => (
                    <RiskRow item={item} key={item.id} />
                  ))}
                </div>
              </div>
              {showWorkspaceAccess && accessStatus ? (
                <div
                  aria-labelledby="staff-workspace-access-heading"
                  className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <h2
                      className="text-sm font-semibold"
                      id="staff-workspace-access-heading"
                    >
                      Workspace Access
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Staff records describe operational people. Workspace Access
                      controls who can sign in.
                    </p>
                  </div>
                  <WorkspaceAccessStatus
                    className="shrink-0 sm:max-w-[420px]"
                    personId={person.id}
                    personName={person.displayName}
                    status={accessStatus}
                  />
                </div>
              ) : null}
            </PersonRecordPanel>

            <PersonRecordPanel
              active={activeSection === "links"}
              ariaLabelledBy="person-tab-links"
              className="min-w-0"
              id="person-links"
            >
              <SectionTitle
                description={getLinkedSummary(person)}
                icon={<ScrollText size={16} />}
                title="Linked records"
              />
              <div className="grid gap-x-6 gap-y-4 py-4 lg:grid-cols-3">
                <LinkedGroup
                  emptyActionHref={person.hrefs.addLease}
                  emptyActionLabel="Add lease"
                  emptyLabel="No active lease is linked."
                  isEmpty={person.linked.activeLeases.length === 0}
                  title="Leases"
                >
                  {person.linked.activeLeases.map((lease) => (
                    <LeaseLinkRow key={lease.id} lease={lease} />
                  ))}
                </LinkedGroup>
                <LinkedGroup
                  emptyActionHref="/properties"
                  emptyActionLabel="Review properties"
                  emptyLabel="No ownership record is linked."
                  isEmpty={person.linked.ownerProperties.length === 0}
                  title="Ownership"
                >
                  {person.linked.ownerProperties.map((property) => (
                    <PropertyLinkRow key={property.id} property={property} />
                  ))}
                </LinkedGroup>
                <LinkedGroup
                  emptyActionHref="/vendors"
                  emptyActionLabel="Review vendors"
                  emptyLabel="No vendor profile is linked."
                  isEmpty={!person.linked.vendorProfile}
                  title="Vendor"
                >
                  {person.linked.vendorProfile ? (
                    <div
                      className="py-3 text-sm"
                      data-slot="linked-record-row"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-medium">
                            {person.linked.vendorProfile.label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {person.linked.vendorProfile.status}
                          </p>
                        </div>
                        {person.linked.vendorProfile.preferred ? (
                          <Badge tone="success">Preferred</Badge>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </LinkedGroup>
              </div>
            </PersonRecordPanel>

            <PersonRecordPanel
              active={activeSection === "photos"}
              ariaLabelledBy="person-tab-photos"
              className="min-w-0"
              id="person-photos"
            >
              <SectionTitle
                description="Profile media"
                icon={<ImageIcon size={16} />}
                title="Photos"
              />
              <div className="grid gap-4 p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="grid aspect-square place-items-center rounded-md border border-border bg-muted">
                  <div className="grid h-20 w-20 place-items-center rounded-full border border-border bg-card text-muted-foreground">
                    <UserRound size={34} />
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/60 p-4 text-sm">
                  <p className="font-semibold">No profile photo yet</p>
                  <p className="mt-2 max-w-2xl leading-6 text-muted-foreground">
                    Person photos need a person-scoped storage target. Related
                    IDs, agreements, and contact evidence can stay in Documents
                    for this record today.
                  </p>
                  <ActionLink
                    className="mt-4"
                    href={person.hrefs.documents}
                    icon={<FileText size={14} />}
                  >
                    Documents
                  </ActionLink>
                </div>
              </div>
            </PersonRecordPanel>

            <PersonRecordPanel
              active={activeSection === "documents"}
              ariaLabelledBy="person-tab-documents"
              className="min-w-0"
              id="person-documents"
            >
              <SectionTitle
                description={`${person.documents.length} related document${
                  person.documents.length === 1 ? "" : "s"
                }`}
                icon={<FileText size={16} />}
                title="Documents"
              />
              {person.documents.length === 0 ? (
                <EmptyRow
                  actionHref={person.hrefs.documents}
                  actionLabel="Open documents"
                  label="No related documents are linked yet."
                />
              ) : (
                <div className="divide-y divide-border">
                  {person.documents.map((document) => (
                    <DocumentRow document={document} key={document.id} />
                  ))}
                </div>
              )}
            </PersonRecordPanel>

            <PersonRecordPanel
              active={activeSection === "timeline"}
              ariaLabelledBy="person-tab-timeline"
              className="min-w-0"
              id="person-timeline"
            >
              <SectionTitle
                description={`${person.activity.length} recent change${
                  person.activity.length === 1 ? "" : "s"
                }`}
                icon={<CalendarDays size={16} />}
                title="Timeline"
              />
              {person.activity.length === 0 ? (
                <EmptyRow
                  actionHref={person.hrefs.addTimelineEvent}
                  actionLabel="Add event"
                  label="No recent activity has been logged for this person."
                />
              ) : (
                <div className="divide-y divide-border">
                  {person.activity.map((change) => (
                    <PersonActivityRow change={change} key={change.id} />
                  ))}
                </div>
              )}
            </PersonRecordPanel>
          </div>
        </div>
      </div>

      {drawer ? (
        <SideDrawer
          description={getDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getDrawerTitle(drawer)}
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
              key={`edit-${drawer.person.id}`}
              mode="edit"
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              person={drawer.person}
              roleContext={getSingleActiveRole(drawer.person)}
            />
          )}
        </SideDrawer>
      ) : null}
    </div>
  );
}

function getSingleActiveRole(person: PeopleSummary) {
  const activeRoles = person.roles.filter((role) => role.status === "active");
  return activeRoles.length === 1 ? activeRoles[0]?.role : undefined;
}

function PersonActivityRow({
  change,
}: {
  change: PeopleSummary["activity"][number];
}) {
  const content = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="break-words font-medium">{change.actionLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {change.entityLabel} / {change.recordLabel}
        </p>
      </div>
      <Badge tone={change.tone}>{formatDate(change.createdAt)}</Badge>
    </div>
  );

  return change.href ? (
    <Link
      className="block px-4 py-3 text-sm transition-colors hover:bg-muted"
      href={change.href}
      prefetch={false}
    >
      {content}
    </Link>
  ) : (
    <div className="px-4 py-3 text-sm">{content}</div>
  );
}

function PersonRecordNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: PersonRecordSection;
  onSectionChange: (section: PersonRecordSection) => void;
}) {
  return (
    <nav
      aria-label="Person record sections"
      className="overflow-x-auto py-1"
      data-slot="person-record-tabs"
    >
      <div className="flex min-w-max items-center gap-1.5" role="tablist">
        {personRecordSections.map((section) => (
          <button
            aria-controls={
              activeSection === section.id ? `person-${section.id}` : undefined
            }
            aria-selected={activeSection === section.id}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              activeSection === section.id &&
                "bg-accent text-foreground",
            )}
            id={`person-tab-${section.id}`}
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            role="tab"
            type="button"
          >
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function PersonRecordPanel({
  active,
  ariaLabelledBy,
  children,
  className,
  id,
}: {
  active: boolean;
  ariaLabelledBy: string;
  children: ReactNode;
  className?: string;
  id: string;
}) {
  if (!active) {
    return null;
  }

  return (
    <section
      aria-labelledby={ariaLabelledBy}
      className={className}
      id={id}
      role="tabpanel"
    >
      {children}
    </section>
  );
}

function Detail({
  children,
  label,
  tone,
  value,
}: {
  children?: ReactNode;
  label: string;
  tone?: PeopleBadgeTone;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {children}
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </dd>
    </div>
  );
}

function SectionTitle({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function RiskRow({
  item,
}: {
  item: PeopleSummary["riskIndicators"][number];
}) {
  return (
    <div className="border-b border-border py-3 text-sm last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{item.label}</p>
          <p className="mt-1 leading-5 text-muted-foreground">{item.description}</p>
        </div>
        <Badge tone={item.tone}>{getRiskToneLabel(item.tone)}</Badge>
      </div>
    </div>
  );
}

function LinkedGroup({
  children,
  emptyActionHref,
  emptyActionLabel,
  emptyLabel,
  isEmpty,
  title,
}: {
  children: ReactNode;
  emptyActionHref: string;
  emptyActionLabel: string;
  emptyLabel: string;
  isEmpty: boolean;
  title: string;
}) {
  return (
    <section className="min-w-0" data-slot="linked-group">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 divide-y divide-border">
        {isEmpty ? (
          <EmptyBlock
            actionHref={emptyActionHref}
            actionLabel={emptyActionLabel}
            label={emptyLabel}
          />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function LeaseLinkRow({ lease }: { lease: PeopleLeaseLink }) {
  return (
    <Link
      className="block py-3 text-sm transition-colors hover:bg-muted"
      data-slot="linked-record-row"
      href={lease.href}
      prefetch={false}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{lease.unitLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lease.propertyLabel} / {lease.label}
          </p>
        </div>
        <Badge tone="success">{lease.status}</Badge>
      </div>
    </Link>
  );
}

function PropertyLinkRow({ property }: { property: PeoplePropertyLink }) {
  return (
    <Link
      className="block py-3 text-sm transition-colors hover:bg-muted"
      data-slot="linked-record-row"
      href={property.href}
      prefetch={false}
    >
      <p className="break-words font-medium">{property.label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{property.ownershipLabel}</p>
    </Link>
  );
}

function DocumentRow({
  document,
}: {
  document: PeopleSummary["documents"][number];
}) {
  const content = (
    <div className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="break-words font-medium">{document.fileName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {document.category} / {formatDate(document.uploadedAt)} /{" "}
          {formatFileSize(document.sizeBytes)}
        </p>
      </div>
      <Badge tone="neutral">{document.mimeType}</Badge>
    </div>
  );

  if (!document.url) {
    return content;
  }

  return (
    <Link
      className="block transition-colors hover:bg-muted"
      href={document.url}
      prefetch={false}
      target="_blank"
    >
      {content}
    </Link>
  );
}

function EmptyBlock({
  actionHref,
  actionLabel,
  label,
}: {
  actionHref: string;
  actionLabel: string;
  label: string;
}) {
  return (
    <div className="py-3 text-sm">
      <p className="text-muted-foreground">{label}</p>
      <ActionLink
        className="mt-3"
        href={actionHref}
        icon={<FileText size={14} />}
      >
        {actionLabel}
      </ActionLink>
    </div>
  );
}

function EmptyRow({
  actionHref,
  actionLabel,
  label,
}: {
  actionHref: string;
  actionLabel: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">{label}</p>
      <ActionLink href={actionHref} icon={<FileText size={14} />}>
        {actionLabel}
      </ActionLink>
    </div>
  );
}

function ActionLink({
  children,
  className,
  href,
  icon,
}: {
  children: ReactNode;
  className?: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[13px] font-medium transition-colors hover:bg-muted",
        className,
      )}
      href={href}
      prefetch={false}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

function getBackHref(person: PeopleSummary) {
  const role = person.roles.find((item) => item.status === "active")?.role;

  if (role === "tenant") {
    return "/tenants";
  }

  if (role === "owner") {
    return "/owners";
  }

  if (role === "vendor") {
    return "/vendors";
  }

  if (role === "staff") {
    return "/staff";
  }

  return "/people";
}

function getBackLabel(person: PeopleSummary) {
  const role = person.roles.find((item) => item.status === "active")?.role;

  return role ? `${formatRole(role)}s` : "People";
}

function getLinkedSummary(person: PeopleSummary) {
  const parts = [
    `${person.recordCounts.leases} lease${
      person.recordCounts.leases === 1 ? "" : "s"
    }`,
    `${person.recordCounts.properties} propert${
      person.recordCounts.properties === 1 ? "y" : "ies"
    }`,
    `${person.recordCounts.vendors} vendor profile${
      person.recordCounts.vendors === 1 ? "" : "s"
    }`,
  ];

  return parts.join(" / ");
}

function getRiskToneLabel(tone: PeopleBadgeTone) {
  if (tone === "success") {
    return "Ready";
  }

  if (tone === "danger") {
    return "Risk";
  }

  if (tone === "warning") {
    return "Review";
  }

  return "Info";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "edit") {
    return "Edit person";
  }

  if (drawer.mode === "restore") {
    return "Restore person";
  }

  return "Archive person";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "edit") {
    return "Update the directory profile, contact details, and role assignments.";
  }

  if (drawer.mode === "restore") {
    return "Return this person to normal operational views.";
  }

  return "Hide this person from active operational views without deleting linked history.";
}
