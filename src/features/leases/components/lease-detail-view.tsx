"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { FilePlus2, MoreHorizontal } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import {
  recordCurrentLeaseOccupancyEvidenceAction,
  recordLeaseDepositEventAction,
  reverseLeaseDepositEventAction,
} from "@/features/leases/actions";
import {
  buildLeaseRecordHref,
  type LeaseRecordSection,
} from "@/features/leases/lease-detail-route";
import type { LeaseSummary } from "@/features/leases/lease.types";
import { formatFileSize } from "@/features/documents/components/document-list";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";

const sections: Array<{ id: LeaseRecordSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rent", label: "Rent & deposit" },
  { id: "occupancy", label: "Move-in & move-out" },
  { id: "files", label: "Files & history" },
];

type LeaseActionPermissions = {
  canActivate: boolean;
  canArchive: boolean;
  canChangeTerms: boolean;
  canClose: boolean;
  canPrepare: boolean;
};

export function LeaseDetailView({
  activeSection,
  lease,
  permissions,
  onAttachFile,
  onLifecycleChange,
  onScheduleTerm,
}: {
  activeSection: LeaseRecordSection;
  lease: LeaseSummary;
  permissions: LeaseActionPermissions;
  onAttachFile: () => void;
  onLifecycleChange: (
    transition: "activate" | "cancel" | "end" | "give_notice" | "terminate",
  ) => void;
  onScheduleTerm: (mode: "renewal" | "rent_change") => void;
}) {
  return (
    <div className="workspace-gutter-x flex flex-col gap-5 pb-12">
      <LeaseRecordNav activeSection={activeSection} leaseId={lease.id} />

      <div aria-label="Lease record details" className="min-w-0" role="region">
        {activeSection === "overview" ? (
          <LeaseOverview
            lease={lease}
            permissions={permissions}
            onLifecycleChange={onLifecycleChange}
            onScheduleTerm={onScheduleTerm}
          />
        ) : null}
        {activeSection === "rent" ? (
          <LeaseRentAndDeposit
            lease={lease}
            permissions={permissions}
            onScheduleTerm={onScheduleTerm}
          />
        ) : null}
        {activeSection === "occupancy" ? (
          <LeaseOccupancy canRecord={permissions.canActivate} lease={lease} />
        ) : null}
        {activeSection === "files" ? (
          <LeaseFilesAndHistory lease={lease} onAttachFile={onAttachFile} />
        ) : null}
      </div>
    </div>
  );
}

function LeaseRecordNav({
  activeSection,
  leaseId,
}: {
  activeSection: LeaseRecordSection;
  leaseId: string;
}) {
  return (
    <nav
      aria-label="Lease record sections"
      className="-mx-1 flex min-w-0 gap-1 overflow-x-auto border-b border-border px-1"
    >
      {sections.map((section) => (
        <Link
          aria-current={activeSection === section.id ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            activeSection === section.id && "border-foreground text-foreground",
          )}
          href={buildLeaseRecordHref({ leaseId, section: section.id })}
          key={section.id}
          scroll={false}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

function LeaseOverview({
  lease,
  permissions,
  onLifecycleChange,
  onScheduleTerm,
}: {
  lease: LeaseSummary;
  permissions: LeaseActionPermissions;
  onLifecycleChange: (
    transition: "activate" | "cancel" | "end" | "give_notice" | "terminate",
  ) => void;
  onScheduleTerm: (mode: "renewal" | "rent_change") => void;
}) {
  const primaryParty = lease.parties[0];

  return (
    <div className="space-y-7">
      <section aria-labelledby="lease-overview-heading">
        <SectionHeading id="lease-overview-heading" title="Lease overview" />
        <dl className="mt-3 grid grid-cols-1 border-y border-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Tenant">
            {primaryParty?.href ? (
              <Link className="hover:underline" href={primaryParty.href}>
                {lease.tenantName}
              </Link>
            ) : (
              lease.tenantName
            )}
          </Metric>
          <Metric
            label="Property / unit"
            value={`${lease.propertyName} / ${lease.unitLabel}`}
          />
          <Metric
            label="Term"
            value={`${lease.startDateLabel} - ${lease.endDateLabel}`}
          />
          <Metric label="Monthly rent">
            <MoneyDisplay value={lease.rentDisplay} />
          </Metric>
        </dl>
      </section>

      <section aria-labelledby="lease-attention-heading">
        <div className="flex flex-col justify-between gap-3 border-y border-warning/35 bg-warning-soft/20 px-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-warning" id="lease-attention-heading">
              Attention
            </p>
            <p className="mt-1 font-semibold">{lease.nextAction.label}</p>
          </div>
          <Badge className="shrink-0" tone={lease.nextAction.tone}>
            {lease.nextAction.tone === "success" ? "Ready" : "Review"}
          </Badge>
        </div>
      </section>

      <section aria-label="Lease actions">
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
          {!lease.isArchived && lease.statusValue === "draft" ? (
            <>
              {permissions.canActivate ? (
              <Button onClick={() => onLifecycleChange("activate")}>
                Activate lease
              </Button>
              ) : null}
              {permissions.canClose ? (
                <Button
                  onClick={() => onLifecycleChange("cancel")}
                  variant="destructive"
                >
                  Cancel draft
                </Button>
              ) : null}
            </>
          ) : null}
          {permissions.canChangeTerms &&
          !lease.isArchived &&
          lease.statusValue === "active" ? (
            <Button onClick={() => onScheduleTerm("renewal")}>
              Renew lease
            </Button>
          ) : null}
          {(permissions.canChangeTerms || permissions.canClose) &&
          !lease.isArchived && lease.statusValue !== "draft" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Manage lease
                  <MoreHorizontal size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                {permissions.canChangeTerms && lease.statusValue === "active" ? (
                  <>
                    <DropdownMenuItem onSelect={() => onScheduleTerm("rent_change")}>Change rent</DropdownMenuItem>
                    {permissions.canClose ? (
                      <DropdownMenuItem onSelect={() => onLifecycleChange("give_notice")}>Record notice</DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
                {permissions.canClose && ["active", "notice_given"].includes(lease.statusValue) ? (
                  <>
                    <DropdownMenuItem onSelect={() => onLifecycleChange("end")}>Complete move-out</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onLifecycleChange("terminate")} variant="destructive">Terminate lease</DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function LeaseRentAndDeposit({
  lease,
  onScheduleTerm,
  permissions,
}: {
  lease: LeaseSummary;
  onScheduleTerm: (mode: "renewal" | "rent_change") => void;
  permissions: LeaseActionPermissions;
}) {
  const [depositState, recordDepositEvent, depositPending] = useActionState(
    recordLeaseDepositEventAction,
    {},
  );
  const [reversalState, reverseDepositEvent, reversalPending] = useActionState(
    reverseLeaseDepositEventAction,
    {},
  );
  const activeTerm = lease.terms.find((term) => term.status === "active");
  const historicalTerms = lease.terms.filter((term) => term.status !== "active");
  const [showRentHistory, setShowRentHistory] = useState(false);
  const [showDepositForm, setShowDepositForm] = useState(false);

  return (
    <div className="space-y-8">
      <section aria-labelledby="rent-deposit-heading">
        <SectionHeading id="rent-deposit-heading" title="Rent & deposit" />
        <dl className="mt-3 grid grid-cols-1 border-y border-border sm:grid-cols-2">
          <Metric label="Current rent">
            <MoneyDisplay value={lease.rentDisplay} />
          </Metric>
          <Metric label="Security deposit" value={getDepositSummary(lease)} />
        </dl>
      </section>

      <section aria-labelledby="rent-terms-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="rent-terms-heading" title="Rent schedule" />
          {permissions.canChangeTerms && activeTerm && !lease.isArchived ? (
            <Button
              onClick={() => onScheduleTerm("rent_change")}
              variant="outline"
            >
              Change rent
            </Button>
          ) : null}
        </div>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {lease.terms.filter((term) => term.status === "active").map((term) => (
            <div
              className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(120px,0.75fr)_minmax(100px,0.5fr)] sm:items-center"
              key={term.id}
            >
              <div>
                <p className="font-medium">{term.datesLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {term.paymentFrequencyLabel} / {term.dueLabel}
                </p>
              </div>
              <MoneyDisplay value={term.rentDisplay} />
              <Badge
                className="w-fit"
                tone={term.status === "active" ? "success" : "neutral"}
              >
                {getTermStatusLabel(term.status)}
              </Badge>
            </div>
          ))}
        </div>
        {historicalTerms.length ? (
          <div className="mt-2">
            <Button onClick={() => setShowRentHistory((visible) => !visible)} variant="ghost">
              Rent history
            </Button>
            {showRentHistory ? (
              <div className="mt-2 divide-y divide-border border-y border-border">
                {historicalTerms.map((term) => (
                  <div className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(120px,0.75fr)_minmax(100px,0.5fr)] sm:items-center" key={term.id}>
                    <div><p className="font-medium">{term.datesLabel}</p><p className="text-xs text-muted-foreground">{term.paymentFrequencyLabel} / {term.dueLabel}</p></div>
                    <MoneyDisplay value={term.rentDisplay} />
                    <Badge className="w-fit" tone="neutral">{getTermStatusLabel(term.status)}</Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="deposit-events-heading">
        <SectionHeading id="deposit-events-heading" title="Deposit activity" />
        {lease.deposits.length ? (
          <div className="mt-3 divide-y divide-border border-y border-border">
            {lease.deposits.map((deposit) => (
              <div className="py-4" key={deposit.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{deposit.typeLabel}</p>
                    <p className="text-sm text-muted-foreground">
                      Held <MoneyDisplay value={deposit.heldBalanceDisplay} />
                    </p>
                  </div>
                  <Badge tone="neutral">{deposit.statusLabel}</Badge>
                </div>
                {deposit.events.length ? (
                  <div className="mt-3 divide-y divide-border border-t border-border">
                    {deposit.events.map((event) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"
                        key={event.id}
                      >
                        <span>
                          {getDepositActivityLabel(event.eventType)} on{" "}
                          {formatDate(event.eventDate)} ·{" "}
                          <MoneyDisplay value={event.amountDisplay} />
                          {event.reference ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {event.reference}
                            </span>
                          ) : null}
                        </span>
                        {permissions.canChangeTerms && event.reversible ? (
                          <form action={reverseDepositEvent}>
                            <input
                              name="eventId"
                              type="hidden"
                              value={event.id}
                            />
                            <input
                              name="eventDate"
                              type="hidden"
                              value={getBusinessDateValue()}
                            />
                            <Button
                              disabled={reversalPending}
                              size="sm"
                              type="submit"
                            >
                              Undo entry
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {permissions.canChangeTerms ? (
                  <div className="mt-3">
                    <Button onClick={() => setShowDepositForm((visible) => !visible)} variant="outline">
                      Record deposit activity
                    </Button>
                  </div>
                ) : null}
                {permissions.canChangeTerms && showDepositForm ? (
                  <form
                    action={recordDepositEvent}
                    className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-5"
                  >
                    <input
                      name="leaseDepositId"
                      type="hidden"
                      value={deposit.id}
                    />
                    <Field label="Activity">
                      <SelectControl
                        ariaLabel="Deposit activity"
                        name="eventType"
                        options={[
                          { label: "Deposit received", value: "received" },
                          { label: "Deposit retained", value: "retained" },
                          { label: "Deposit refunded", value: "refunded" },
                        ]}
                      />
                    </Field>
                    <Field label="Date">
                      <DatePickerField
                        ariaLabel="Deposit activity date"
                        defaultValue={getBusinessDateValue()}
                        name="eventDate"
                      />
                    </Field>
                    <Field label="Amount">
                      <NumberInput name="amount" required />
                    </Field>
                    <Field label="Receipt or note">
                      <Input name="reference" />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        className="w-full"
                        disabled={depositPending}
                        type="submit"
                      >
                        {depositPending ? "Saving..." : "Save deposit activity"}
                      </Button>
                    </div>
                  </form>
                ) : null}
                <ActionMessage state={depositState} />
                <ActionMessage state={reversalState} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyLine label="No deposit activity recorded." />
        )}
      </section>
    </div>
  );
}

function LeaseOccupancy({
  canRecord: canRecordEvidence,
  lease,
}: {
  canRecord: boolean;
  lease: LeaseSummary;
}) {
  const [state, recordEvidence, pending] = useActionState(
    recordCurrentLeaseOccupancyEvidenceAction,
    {},
  );
  const currentOccupancy =
    lease.occupancies.find(
      (occupancy) => occupancy.evidenceState === "accepted",
    ) ?? lease.occupancies[0];
  const historicalOccupancies = lease.occupancies.filter(
    (occupancy) => occupancy.id !== currentOccupancy?.id,
  );
  const [showOccupancyHistory, setShowOccupancyHistory] = useState(false);
  const canRecord =
    canRecordEvidence &&
    !lease.isArchived &&
    ["active", "notice_given"].includes(lease.statusValue) &&
    currentOccupancy?.actualLabel === "Not recorded";

  return (
    <div className="space-y-8">
      <section aria-labelledby="occupancy-heading">
        <SectionHeading id="occupancy-heading" title="Move-in & move-out" />
        <div className="mt-3 divide-y divide-border border-y border-border">
          {currentOccupancy ? (
            <>
              <div
                className="grid gap-3 py-4 text-sm md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]"
              >
                <Detail label="Unit" value={currentOccupancy.unitLabel} />
                <Detail
                  label="Planned dates"
                  value={currentOccupancy.scheduledLabel}
                />
                <Detail label="Confirmed dates" value={currentOccupancy.actualLabel} />
                <Detail
                  label="Confirmation"
                  value={getMoveInConfirmation(
                    currentOccupancy.actualLabel,
                    currentOccupancy.residentLabel,
                  )}
                />
              </div>
              {historicalOccupancies.length ? (
                <div className="py-2">
                  <Button
                    onClick={() => setShowOccupancyHistory((visible) => !visible)}
                    variant="ghost"
                  >
                    Occupancy history
                  </Button>
                  {showOccupancyHistory ? (
                    <div className="mt-2 divide-y divide-border border-t border-border">
                      {historicalOccupancies.map((occupancy) => (
                        <div
                          className="grid gap-3 py-4 text-sm md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]"
                          key={occupancy.id}
                        >
                          <Detail label="Unit" value={occupancy.unitLabel} />
                          <Detail label="Planned dates" value={occupancy.scheduledLabel} />
                          <Detail label="Confirmed dates" value={occupancy.actualLabel} />
                          <Detail
                            label="Resident"
                            value={occupancy.residentLabel || "Not recorded"}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <EmptyLine label="No move-in or move-out details recorded." />
          )}
        </div>
      </section>

      {canRecord && currentOccupancy ? (
        <section aria-labelledby="occupancy-evidence-heading">
          <SectionHeading
            id="occupancy-evidence-heading"
            title="Move-in confirmation"
          />
          <form
            action={recordEvidence}
            className="mt-3 grid gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <input name="leaseId" type="hidden" value={lease.id} />
            <input
              name="occupancyId"
              type="hidden"
              value={currentOccupancy.id}
            />
            <Field label="Scheduled move-in">
              <DatePickerField
                ariaLabel="Scheduled move-in date"
                name="scheduledMoveInDate"
              />
            </Field>
            <Field label="Scheduled move-out">
              <DatePickerField
                ariaLabel="Scheduled move-out date"
                name="scheduledMoveOutDate"
              />
            </Field>
            <Field label="Confirmed move-in">
              <DatePickerField
                ariaLabel="Confirmed move-in date"
                name="actualMoveInDate"
                required
              />
            </Field>
            <Field label="How was move-in confirmed?">
              <Input
                aria-label="Move-in confirmation note"
                name="reason"
                placeholder="Inspection, tenant confirmation, or handover note"
                required
              />
            </Field>
            <ActionMessage
              className="sm:col-span-2 lg:col-span-3"
              state={state}
            />
            <div className="flex justify-end lg:col-start-4">
              <Button disabled={pending} type="submit">
                {pending ? "Saving..." : "Confirm move-in"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function LeaseFilesAndHistory({
  lease,
  onAttachFile,
}: {
  lease: LeaseSummary;
  onAttachFile: () => void;
}) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="files-history-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="files-history-heading" title="Files & history" />
          <Button onClick={onAttachFile} variant="outline">
            <FilePlus2 aria-hidden size={14} /> Attach file
          </Button>
        </div>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {lease.documents.length ? (
            lease.documents.map((document) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={document.id}
              >
                <div className="min-w-0">
                  {document.url ? (
                    <a
                      className="font-medium hover:underline"
                      href={document.url}
                    >
                      {document.fileName}
                    </a>
                  ) : (
                    <p className="font-medium">{document.fileName}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {document.category} / {formatFileSize(document.sizeBytes)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {document.linkedRecordLabel}
                </span>
              </div>
            ))
          ) : (
            <EmptyLine label="No lease files attached." />
          )}
        </div>
      </section>

      <section aria-labelledby="history-heading">
        <SectionHeading id="history-heading" title="Record history" />
        <div className="mt-3 divide-y divide-border border-y border-border">
          {lease.timeline.length ? (
            lease.timeline.map((event) => (
              <Link
                className="grid gap-1 py-3 text-sm hover:bg-muted/50 sm:grid-cols-[140px_minmax(0,1fr)_160px]"
                href={event.href}
                key={event.id}
              >
                <span className="text-muted-foreground">
                  {event.eventDateLabel}
                </span>
                <span className="font-medium">{event.title}</span>
                <span className="text-muted-foreground sm:text-right">
                  {event.typeLabel}
                </span>
              </Link>
            ))
          ) : lease.activity.length ? (
            lease.activity.map((change) => (
              <div
                className="grid gap-1 py-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)_160px]"
                key={change.id}
              >
                <span className="text-muted-foreground">
                  {formatDate(change.createdAt)}
                </span>
                <span className="font-medium">{change.actionLabel}</span>
                <span className="text-muted-foreground sm:text-right">
                  {change.recordLabel}
                </span>
              </div>
            ))
          ) : (
            <EmptyLine label="No lease history recorded." />
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2 className="text-base font-semibold" id={id}>
      {title}
    </h2>
  );
}

function Metric({
  children,
  label,
  value,
}: {
  children?: ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <div className="min-w-0 border-b border-border px-0 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">
        {children ?? value}
      </dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyLine({ label }: { label: string }) {
  return <p className="py-5 text-sm text-muted-foreground">{label}</p>;
}

function ActionMessage({
  className,
  state,
}: {
  className?: string;
  state: { message?: string; status?: string };
}) {
  return state.message ? (
    <p
      className={cn(
        "text-xs",
        state.status === "error" ? "text-danger" : "text-muted-foreground",
        className,
      )}
      role="status"
    >
      {state.message}
    </p>
  ) : null;
}

function getDepositSummary(lease: LeaseSummary) {
  const deposit = lease.deposits[0];
  return deposit
    ? `${deposit.heldBalanceDisplay.primary} held`
    : lease.depositLabel;
}

function getTermStatusLabel(status: LeaseSummary["terms"][number]["status"]) {
  if (status === "active") return "Current";
  if (status === "upcoming") return "Starts later";
  if (status === "expired") return "Ended";
  if (status === "terminated") return "Ended early";
  if (status === "superseded") return "Replaced";
  return "Draft";
}

function getDepositActivityLabel(eventType: string) {
  if (eventType === "received") return "Deposit received";
  if (eventType === "applied") return "Deposit used";
  if (eventType === "retained") return "Deposit retained";
  if (eventType === "refunded") return "Deposit refunded";
  return "Deposit updated";
}

function getMoveInConfirmation(actualLabel: string, residentLabel: string) {
  if (actualLabel === "Not recorded") return "Not confirmed";
  if (residentLabel === "Resident evidence missing") {
    return "Resident needs confirmation";
  }

  return residentLabel;
}
