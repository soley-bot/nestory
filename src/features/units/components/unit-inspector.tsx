import Link from "next/link";
import {
  Archive,
  Building2,
  ExternalLink,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { formatUnitTimelineContext } from "@/features/units/data/unit-summary";
import type { UnitSummary } from "@/features/units/unit.types";

type UnitInspectorProps = {
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  unit: UnitSummary | null;
};

export function UnitInspector({
  onArchiveUnit,
  onEditUnit,
  onRestoreUnit,
  unit,
}: UnitInspectorProps) {
  if (!unit) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4 2xl:sticky 2xl:top-5">
        <div className="flex items-center gap-2">
          <Building2 className="text-muted" size={16} />
          <h2 className="text-base font-semibold">Unit inspector</h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Select a unit row to inspect rent, ledger context, lease state, and the
          latest timeline record.
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
              {unit.propertyCode}
            </p>
            <h2 className="mt-1 break-words text-base font-semibold">
              Unit {unit.unitNumber}
            </h2>
            <p className="mt-1 break-words text-sm text-muted">
              {unit.propertyName}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
            {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Detail label="Floor" value={unit.floorLabel} />
          <Detail label="Lease" value={unit.leaseLabel} />
          <Detail label="Current rent" wide>
            {unit.rentDisplay ? (
              <MoneyDisplay value={unit.rentDisplay} />
            ) : (
              unit.rentLabel
            )}
          </Detail>
          <Detail label="Ledger net" wide>
            <MoneyDisplay value={unit.ledgerNetDisplay} />
          </Detail>
        </dl>

        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-muted">
            <ListTree size={15} />
            <p className="text-xs font-medium uppercase tracking-[0.06em]">
              Latest record
            </p>
          </div>
          {unit.latestTimelineEvent ? (
            <div className="mt-2 text-sm leading-5">
              <p className="line-clamp-2 font-medium">
                {unit.latestTimelineEvent.title}
              </p>
              <p className="mt-1 text-xs text-muted">
                {formatUnitTimelineContext(unit.latestTimelineEvent)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">No timeline events yet.</p>
          )}
        </section>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <Link
            aria-label={`Open unit ${unit.unitNumber}`}
            className={iconButtonClassName}
            href={`/units/${unit.id}`}
            prefetch={false}
            title="Open unit"
          >
            <ExternalLink size={15} />
          </Link>
          {unit.isArchived ? (
            <button
              aria-label={`Restore unit ${unit.unitNumber}`}
              className={primaryIconButtonClassName}
              onClick={() => onRestoreUnit(unit)}
              title="Restore unit"
              type="button"
            >
              <RotateCcw size={15} />
            </button>
          ) : (
            <button
              aria-label={`Edit unit ${unit.unitNumber}`}
              className={iconButtonClassName}
              onClick={() => onEditUnit(unit)}
              title="Edit unit"
              type="button"
            >
              <Pencil size={15} />
            </button>
          )}
          {!unit.isArchived ? (
            <button
              aria-label={`Archive unit ${unit.unitNumber}`}
              className={`${iconButtonClassName} text-danger hover:text-danger`}
              onClick={() => onArchiveUnit(unit)}
              title="Archive unit"
              type="button"
            >
              <Archive size={15} />
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            aria-label={`Open timeline filtered to unit ${unit.unitNumber}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={`/timeline?unitId=${unit.id}`}
            title="Open unit timeline"
          >
            <ListTree size={15} />
          </Link>
          <Link
            aria-label={`Open ledger filtered to unit ${unit.unitNumber}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={`/ledger?propertyId=${unit.propertyId}&query=${encodeURIComponent(
              unit.unitNumber,
            )}`}
            title="Open unit ledger"
          >
            <Landmark size={15} />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function Detail({
  children,
  label,
  value,
  wide = false,
}: {
  children?: React.ReactNode;
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}
