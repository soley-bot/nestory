"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { ArrowRight, FilePlus2 } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { SelectControl } from "@/components/ui/select-control";
import {
  recordCurrentLeaseOccupancyEvidenceAction,
  recordLeaseDepositEventAction,
  reverseLeaseDepositEventAction,
  scheduleFutureRentTermAction,
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
  { id: "occupancy", label: "Occupancy" },
  { id: "files", label: "Files & history" },
];

export function LeaseDetailView({
  activeSection,
  canConfigure,
  lease,
  onLifecycleChange,
}: {
  activeSection: LeaseRecordSection;
  canConfigure: boolean;
  lease: LeaseSummary;
  onLifecycleChange: (transition: "give_notice" | "terminate") => void;
}) {
  return (
    <div className="workspace-gutter-x flex flex-col gap-5 pb-12">
      <LeaseRecordNav activeSection={activeSection} leaseId={lease.id} />

      <div aria-label="Lease record details" className="min-w-0" role="region">
        {activeSection === "overview" ? (
          <LeaseOverview
            canConfigure={canConfigure}
            lease={lease}
            onLifecycleChange={onLifecycleChange}
          />
        ) : null}
        {activeSection === "rent" ? (
          <LeaseRentAndDeposit canConfigure={canConfigure} lease={lease} />
        ) : null}
        {activeSection === "occupancy" ? (
          <LeaseOccupancy canConfigure={canConfigure} lease={lease} />
        ) : null}
        {activeSection === "files" ? <LeaseFilesAndHistory lease={lease} /> : null}
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
  canConfigure,
  lease,
  onLifecycleChange,
}: {
  canConfigure: boolean;
  lease: LeaseSummary;
  onLifecycleChange: (transition: "give_notice" | "terminate") => void;
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
          <Metric label="Property / unit" value={`${lease.propertyName} / ${lease.unitLabel}`} />
          <Metric label="Term" value={`${lease.startDateLabel} - ${lease.endDateLabel}`} />
          <Metric label="Monthly rent">
            <MoneyDisplay value={lease.rentDisplay} />
          </Metric>
        </dl>
      </section>

      <section aria-labelledby="lease-attention-heading">
        <SectionHeading id="lease-attention-heading" title="Current attention" />
        <div className="mt-3 flex flex-col justify-between gap-3 border-y border-border py-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="font-medium">{lease.nextAction.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {lease.nextAction.description}
            </p>
          </div>
          <Badge className="shrink-0" tone={lease.nextAction.tone}>
            {lease.nextAction.tone === "success" ? "Ready" : "Review"}
          </Badge>
        </div>
      </section>

      <section aria-labelledby="lease-lifecycle-heading">
        <SectionHeading id="lease-lifecycle-heading" title="Lease lifecycle" />
        <div className="mt-3 flex flex-wrap items-center gap-2 border-y border-border py-3">
          <Link
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            href={buildLeaseRecordHref({ leaseId: lease.id, section: "rent" })}
          >
            Renew or change rent
            <ArrowRight aria-hidden size={14} />
          </Link>
          {canConfigure && !lease.isArchived && lease.statusValue === "active" ? (
            <Button onClick={() => onLifecycleChange("give_notice")}>
              Give notice
            </Button>
          ) : null}
          {canConfigure && !lease.isArchived && !["ended", "terminated", "cancelled"].includes(lease.statusValue) ? (
            <Button onClick={() => onLifecycleChange("terminate")} variant="outline">
              Terminate lease
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function LeaseRentAndDeposit({
  canConfigure,
  lease,
}: {
  canConfigure: boolean;
  lease: LeaseSummary;
}) {
  const [scheduleState, scheduleFutureTerm, schedulePending] = useActionState(
    scheduleFutureRentTermAction,
    {},
  );
  const [depositState, recordDepositEvent, depositPending] = useActionState(
    recordLeaseDepositEventAction,
    {},
  );
  const [reversalState, reverseDepositEvent, reversalPending] = useActionState(
    reverseLeaseDepositEventAction,
    {},
  );
  const [idempotencySeed] = useState(() => crypto.randomUUID());
  const activeTerm = lease.terms.find((term) => term.status === "active");

  return (
    <div className="space-y-8">
      <section aria-labelledby="rent-deposit-heading">
        <SectionHeading id="rent-deposit-heading" title="Rent & deposit" />
        <dl className="mt-3 grid grid-cols-1 border-y border-border sm:grid-cols-3">
          <Metric label="Current rent"><MoneyDisplay value={lease.rentDisplay} /></Metric>
          <Metric label="Rent status" value={lease.rentReadiness.label} />
          <Metric label="Security deposit" value={getDepositSummary(lease)} />
        </dl>
      </section>

      <section aria-labelledby="rent-terms-heading">
        <SectionHeading id="rent-terms-heading" title="Rent terms" />
        <div className="mt-3 divide-y divide-border border-y border-border">
          {lease.terms.map((term) => (
            <div className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(120px,0.75fr)_minmax(100px,0.5fr)] sm:items-center" key={term.id}>
              <div>
                <p className="font-medium">{term.datesLabel}</p>
                <p className="text-xs text-muted-foreground">{term.paymentFrequencyLabel} / {term.dueLabel}</p>
              </div>
              <MoneyDisplay value={term.rentDisplay} />
              <Badge className="w-fit" tone={term.status === "active" ? "success" : "neutral"}>{term.statusLabel}</Badge>
            </div>
          ))}
        </div>
      </section>

      {canConfigure && activeTerm && !lease.isArchived ? (
        <section aria-labelledby="future-rent-heading">
          <SectionHeading id="future-rent-heading" title="Schedule future rent" />
          <form action={scheduleFutureTerm} className="mt-3 grid gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-5">
            <input name="leaseId" type="hidden" value={lease.id} />
            <input name="supersedesTermId" type="hidden" value={activeTerm.id} />
            <input name="idempotencyKey" type="hidden" value={`${idempotencySeed}:${lease.id}:${activeTerm.id}`} />
            <Field label="Effective date"><DatePickerField ariaLabel="Future term effective date" name="startDate" required /></Field>
            <Field label="Term end"><DatePickerField ariaLabel="Future term end date" name="endDate" required /></Field>
            <Field label="Rent amount"><NumberInput defaultValue={activeTerm.rentAmount} min="0" name="rentAmount" required /></Field>
            <Field label="Due day"><NumberInput defaultValue={activeTerm.rentDueDay ?? undefined} max="31" min="1" name="rentDueDay" required /></Field>
            <Field label="Frequency">
              <SelectControl
                ariaLabel="Future term payment frequency"
                defaultValue={activeTerm.paymentFrequency ?? "monthly"}
                name="paymentFrequency"
                options={[
                  { label: "Monthly", value: "monthly" },
                  { label: "Quarterly", value: "quarterly" },
                  { label: "Semi-annual", value: "semi_annual" },
                  { label: "Annual", value: "annual" },
                  { label: "One time", value: "one_time" },
                ]}
                required
              />
            </Field>
            <div className="flex items-end lg:col-start-5">
              <Button className="w-full" disabled={schedulePending} type="submit">
                {schedulePending ? "Scheduling..." : "Schedule future term"}
              </Button>
            </div>
            <ActionMessage className="sm:col-span-2 lg:col-span-5" state={scheduleState} />
          </form>
        </section>
      ) : null}

      <section aria-labelledby="deposit-events-heading">
        <SectionHeading id="deposit-events-heading" title="Deposit events" />
        {lease.deposits.length ? (
          <div className="mt-3 divide-y divide-border border-y border-border">
            {lease.deposits.map((deposit) => (
              <div className="py-4" key={deposit.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{deposit.typeLabel}</p>
                    <p className="text-sm text-muted-foreground">Held <MoneyDisplay value={deposit.heldBalanceDisplay} /></p>
                  </div>
                  <Badge tone="neutral">{deposit.statusLabel}</Badge>
                </div>
                {deposit.events.length ? (
                  <div className="mt-3 divide-y divide-border border-t border-border">
                    {deposit.events.map((event) => (
                      <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm" key={event.id}>
                        <span>{event.eventDate} / {event.eventType} / <MoneyDisplay value={event.amountDisplay} /> {event.reference}</span>
                        {canConfigure && event.reversible ? (
                          <form action={reverseDepositEvent}>
                            <input name="eventId" type="hidden" value={event.id} />
                            <input name="eventDate" type="hidden" value={getBusinessDateValue()} />
                            <Button disabled={reversalPending} size="sm" type="submit">Reverse</Button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {canConfigure ? (
                  <form action={recordDepositEvent} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-5">
                    <input name="leaseDepositId" type="hidden" value={deposit.id} />
                    <Field label="Event type"><SelectControl ariaLabel="Deposit event type" name="eventType" options={[{ label: "Receipt", value: "received" }, { label: "Application", value: "applied" }, { label: "Retention", value: "retained" }, { label: "Refund", value: "refunded" }]} /></Field>
                    <Field label="Event date"><DatePickerField ariaLabel="Deposit event date" defaultValue={getBusinessDateValue()} name="eventDate" /></Field>
                    <Field label="Amount"><NumberInput name="amount" required /></Field>
                    <Field label="Reference"><Input name="reference" /></Field>
                    <div className="flex items-end"><Button className="w-full" disabled={depositPending} type="submit">{depositPending ? "Saving..." : "Record event"}</Button></div>
                  </form>
                ) : null}
                <ActionMessage state={depositState} />
                <ActionMessage state={reversalState} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyLine label="No deposit events recorded." />
        )}
      </section>
    </div>
  );
}

function LeaseOccupancy({
  canConfigure,
  lease,
}: {
  canConfigure: boolean;
  lease: LeaseSummary;
}) {
  const [state, recordEvidence, pending] = useActionState(
    recordCurrentLeaseOccupancyEvidenceAction,
    {},
  );
  const currentOccupancy =
    lease.occupancies.find((occupancy) => occupancy.evidenceState === "accepted") ??
    lease.occupancies[0];
  const canRecord =
    canConfigure &&
    !lease.isArchived &&
    ["active", "notice_given"].includes(lease.statusValue) &&
    currentOccupancy?.actualLabel === "Not recorded";

  return (
    <div className="space-y-8">
      <section aria-labelledby="occupancy-heading">
        <SectionHeading id="occupancy-heading" title="Occupancy" />
        <div className="mt-3 divide-y divide-border border-y border-border">
          {lease.occupancies.length ? lease.occupancies.map((occupancy) => (
            <div className="grid gap-3 py-4 text-sm md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]" key={occupancy.id}>
              <Detail label="Unit" value={occupancy.unitLabel} />
              <Detail label="Scheduled" value={occupancy.scheduledLabel} />
              <Detail label="Confirmed" value={occupancy.actualLabel} />
              <Detail label="Evidence" value={`${occupancy.residentLabel} / ${occupancy.evidenceLabel}`} />
            </div>
          )) : <EmptyLine label="No occupancy record." />}
        </div>
      </section>

      <section aria-labelledby="occupancy-evidence-heading">
        <SectionHeading id="occupancy-evidence-heading" title="Occupancy evidence" />
        {canRecord && currentOccupancy ? (
          <form action={recordEvidence} className="mt-3 grid gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-4">
            <input name="leaseId" type="hidden" value={lease.id} />
            <input name="occupancyId" type="hidden" value={currentOccupancy.id} />
            <Field label="Scheduled move-in"><DatePickerField ariaLabel="Scheduled move-in date" name="scheduledMoveInDate" /></Field>
            <Field label="Scheduled move-out"><DatePickerField ariaLabel="Scheduled move-out date" name="scheduledMoveOutDate" /></Field>
            <Field label="Confirmed move-in"><DatePickerField ariaLabel="Confirmed move-in date" name="actualMoveInDate" required /></Field>
            <Field label="Evidence"><Input aria-label="Occupancy evidence reason" name="reason" placeholder="How was occupancy confirmed?" required /></Field>
            <ActionMessage className="sm:col-span-2 lg:col-span-3" state={state} />
            <div className="flex justify-end lg:col-start-4"><Button disabled={pending} type="submit">{pending ? "Recording..." : "Record occupancy evidence"}</Button></div>
          </form>
        ) : (
          <div className="mt-3 border-y border-border py-4 text-sm text-muted-foreground">
            {currentOccupancy
              ? `${currentOccupancy.residentLabel} / ${currentOccupancy.evidenceLabel}`
              : "No occupancy evidence recorded."}
          </div>
        )}
      </section>
    </div>
  );
}

function LeaseFilesAndHistory({ lease }: { lease: LeaseSummary }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="files-history-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="files-history-heading" title="Files & history" />
          <Link className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href={lease.hrefs.addDocument}>
            <FilePlus2 aria-hidden size={14} /> Attach file
          </Link>
        </div>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {lease.documents.length ? lease.documents.map((document) => (
            <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={document.id}>
              <div className="min-w-0">
                {document.url ? <a className="font-medium hover:underline" href={document.url}>{document.fileName}</a> : <p className="font-medium">{document.fileName}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{document.category} / {formatFileSize(document.sizeBytes)}</p>
              </div>
              <span className="text-xs text-muted-foreground">{document.linkedRecordLabel}</span>
            </div>
          )) : <EmptyLine label="No lease files attached." />}
        </div>
      </section>

      <section aria-labelledby="history-heading">
        <SectionHeading id="history-heading" title="Record history" />
        <div className="mt-3 divide-y divide-border border-y border-border">
          {lease.timeline.length ? lease.timeline.map((event) => (
            <Link className="grid gap-1 py-3 text-sm hover:bg-muted/50 sm:grid-cols-[140px_minmax(0,1fr)_160px]" href={event.href} key={event.id}>
              <span className="text-muted-foreground">{event.eventDateLabel}</span>
              <span className="font-medium">{event.title}</span>
              <span className="text-muted-foreground sm:text-right">{event.typeLabel}</span>
            </Link>
          )) : lease.activity.length ? lease.activity.map((change) => (
            <div className="grid gap-1 py-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)_160px]" key={change.id}>
              <span className="text-muted-foreground">{formatDate(change.createdAt)}</span>
              <span className="font-medium">{change.actionLabel}</span>
              <span className="text-muted-foreground sm:text-right">{change.recordLabel}</span>
            </div>
          )) : <EmptyLine label="No lease history recorded." />}
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return <h2 className="text-base font-semibold" id={id}>{title}</h2>;
}

function Metric({ children, label, value }: { children?: ReactNode; label: string; value?: string }) {
  return <div className="min-w-0 border-b border-border px-0 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{children ?? value}</dd></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid min-w-0 gap-1 text-xs font-medium"><span>{label}</span>{children}</label>;
}

function EmptyLine({ label }: { label: string }) {
  return <p className="py-5 text-sm text-muted-foreground">{label}</p>;
}

function ActionMessage({ className, state }: { className?: string; state: { message?: string; status?: string } }) {
  return state.message ? <p className={cn("text-xs", state.status === "error" ? "text-danger" : "text-muted-foreground", className)} role="status">{state.message}</p> : null;
}

function getDepositSummary(lease: LeaseSummary) {
  const deposit = lease.deposits[0];
  return deposit ? `${deposit.heldBalanceDisplay.primary} held` : lease.depositLabel;
}
