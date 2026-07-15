import Link from "next/link";
import {
  Archive,
  ExternalLink,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
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
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Rent">
            {unit.rentDisplay ? (
              <MoneyDisplay value={unit.rentDisplay} />
            ) : (
              unit.rentLabel
            )}
          </Detail>
          <Detail label="Ledger net">
            <MoneyDisplay value={unit.ledgerNetDisplay} />
          </Detail>
        </dl>

        {!unit.hasActiveLease ? (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-foreground-muted">
              No active lease linked.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link
                aria-label={`Add lease for unit ${unit.unitNumber}`}
                className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-warning/30 bg-warning-soft/40 px-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-warning-soft focus-visible:ring-2 focus-visible:ring-focus-ring"
                href={getCreateLeaseHref(unit)}
                title="Add lease for this unit"
              >
                <ScrollText size={14} />
                <span className="truncate">Add lease</span>
              </Link>
              <button
                aria-label={`Edit status for unit ${unit.unitNumber}`}
                className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => onEditUnit(unit)}
                title="Edit unit status"
                type="button"
              >
                <Pencil size={14} />
                <span className="truncate">Edit status</span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2 text-sm">
          <Link
            aria-label={`Open unit ${unit.unitNumber}`}
            className={iconButtonClassName}
            href={`/units/${unit.id}`}
            prefetch={false}
            title="Open unit"
          >
            <ExternalLink size={15} />
            <span className="truncate">Open</span>
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
              <span className="truncate">Restore</span>
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
              <span className="truncate">Edit</span>
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
              <span className="truncate">Archive</span>
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            aria-label={`Open timeline filtered to unit ${unit.unitNumber}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
            href={`/timeline?unitId=${unit.id}`}
            title="Open unit timeline"
          >
            <ListTree size={15} />
            <span className="truncate">Timeline</span>
          </Link>
          <Link
            aria-label={`Open ledger filtered to unit ${unit.unitNumber}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
            href={`/ledger?propertyId=${unit.propertyId}&query=${encodeURIComponent(
              unit.unitNumber,
            )}`}
            title="Open unit ledger"
          >
            <Landmark size={15} />
            <span className="truncate">Ledger</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function getCreateLeaseHref(unit: UnitSummary) {
  const params = new URLSearchParams({
    action: "create",
    propertyId: unit.propertyId,
    unitId: unit.id,
  });

  return `/leases?${params.toString()}`;
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
    <div
      className={
        wide
          ? "col-span-2 min-w-0 rounded-md border border-border px-3 py-2.5"
          : "min-w-0 rounded-md border border-border px-3 py-2.5"
      }
    >
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}
