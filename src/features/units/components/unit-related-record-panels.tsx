import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import type {
  UnitLeaseSummary,
  UnitLedgerContext,
  UnitMaintenanceContext,
  UnitPersonLink,
} from "@/features/units/unit.types";
import { formatDate } from "@/lib/dates/format";

const fullRecordLinkClassName =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted";

export function UnitLeaseDetailsPanel({
  fullRecordHref,
  lease,
  people,
}: {
  fullRecordHref: string;
  lease: UnitLeaseSummary;
  people: UnitPersonLink[];
}) {
  return (
    <RecordPanelFooter href={fullRecordHref} label="Open full lease">
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Tenant
            </p>
            <p className="mt-1 text-base font-semibold">{lease.tenantName}</p>
          </div>
          <Badge>{lease.statusLabel}</Badge>
        </div>

        <dl className="divide-y divide-border border-y border-border text-sm">
          <PanelFact label="Lease dates">
            {formatDate(lease.startDate)} – {formatDate(lease.endDate)}
          </PanelFact>
          <PanelFact label="Monthly rent">
            <MoneyDisplay value={lease.monthlyRentDisplay} />
          </PanelFact>
        </dl>

        {people.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              People
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {people.map((person) => (
                <Link
                  className="inline-flex h-8 items-center rounded-full border border-border px-2.5 text-sm font-medium hover:bg-muted"
                  href={person.href}
                  key={person.id}
                >
                  {person.displayName}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </RecordPanelFooter>
  );
}

export function UnitLedgerEntryPanel({ entry }: { entry: UnitLedgerContext }) {
  return (
    <RecordPanelFooter
      href={`/ledger?entryId=${entry.id}&archiveState=all`}
      label="Open in Ledger"
    >
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              {entry.direction}
            </p>
            <p className="mt-1 text-base font-semibold">{entry.category}</p>
          </div>
          <MoneyDisplay align="right" size="large" value={entry.amountDisplay} />
        </div>

        <dl className="divide-y divide-border border-y border-border text-sm">
          <PanelFact label="Date">{formatDate(entry.transactionDate)}</PanelFact>
          <PanelFact label="Description">
            {entry.description || "No description recorded"}
          </PanelFact>
        </dl>
      </div>
    </RecordPanelFooter>
  );
}

export function UnitMaintenanceCasePanel({
  maintenanceCase,
}: {
  maintenanceCase: UnitMaintenanceContext;
}) {
  return (
    <RecordPanelFooter href={maintenanceCase.href} label="Open in Maintenance">
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              {maintenanceCase.category}
            </p>
            <p className="mt-1 text-base font-semibold">
              {maintenanceCase.title}
            </p>
          </div>
          <Badge tone={maintenanceCase.statusTone}>
            {maintenanceCase.statusLabel}
          </Badge>
        </div>

        <dl className="divide-y divide-border border-y border-border text-sm">
          <PanelFact label="Due">{maintenanceCase.dueLabel}</PanelFact>
          <PanelFact label="Priority">{maintenanceCase.priorityLabel}</PanelFact>
          <PanelFact label="Actual cost">
            {maintenanceCase.actualCostLabel}
          </PanelFact>
        </dl>
      </div>
    </RecordPanelFooter>
  );
}

function PanelFact({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium sm:text-right">{children}</dd>
    </div>
  );
}

function RecordPanelFooter({
  children,
  href,
  label,
}: {
  children: React.ReactNode;
  href: string;
  label: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div className="flex shrink-0 justify-end border-t border-border px-4 py-3 sm:px-5">
        <Link className={fullRecordLinkClassName} href={href} prefetch={false}>
          {label}
          <ExternalLink size={14} />
        </Link>
      </div>
    </div>
  );
}
