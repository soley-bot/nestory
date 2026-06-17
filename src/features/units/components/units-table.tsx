import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, ExternalLink, Pencil, RotateCcw } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUnitTimelineContext } from "@/features/units/data/unit-summary";
import type {
  UnitArchiveState,
  UnitSummary,
} from "@/features/units/unit.types";

type UnitsTableProps = {
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  onSelectUnit: (id: string) => void;
  selectedUnitId: string;
  archiveState: UnitArchiveState;
  units: UnitSummary[];
};

export function UnitsTable({
  archiveState,
  onArchiveUnit,
  onEditUnit,
  onRestoreUnit,
  onSelectUnit,
  selectedUnitId,
  units,
}: UnitsTableProps) {
  return (
    <div>
      <div className="space-y-3 md:hidden">
        {units.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            {getEmptyMessage(archiveState)}
          </p>
        ) : null}
        {units.map((unit) => (
          <article
            className={[
              "cursor-pointer rounded-md border border-border bg-surface p-4 text-sm transition-colors hover:bg-surface-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              selectedUnitId === unit.id ? "border-accent bg-accent-soft" : "",
              unit.isArchived ? "text-muted" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={unit.id}
            onClick={() => onSelectUnit(unit.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectUnit(unit.id);
              }
            }}
            tabIndex={0}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  className="break-words font-medium text-accent hover:underline"
                  href={`/units/${unit.id}`}
                  onClick={(event) => event.stopPropagation()}
                  prefetch={false}
                >
                  Unit {unit.unitNumber}
                </Link>
                <p className="mt-1 break-words text-xs text-muted">
                  {unit.propertyCode} / {unit.propertyName}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
                {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <UnitCardDetail label="Floor" value={unit.floorLabel} />
              <UnitCardDetail
                label="Rent"
                value={
                  unit.rentDisplay ? (
                    <MoneyDisplay align="right" value={unit.rentDisplay} />
                  ) : (
                    unit.rentLabel
                  )
                }
                align="right"
              />
              <UnitCardDetail label="Lease" value={unit.leaseLabel} />
              <UnitCardDetail
                label="Ledger net"
                value={<MoneyDisplay align="right" value={unit.ledgerNetDisplay} />}
                align="right"
              />
            </dl>
            <UnitRecordContext className="mt-4" unit={unit} />
            <UnitActions
              className="mt-4"
              onArchiveUnit={onArchiveUnit}
              onEditUnit={onEditUnit}
              onRestoreUnit={onRestoreUnit}
              unit={unit}
            />
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
        <div className="max-h-[min(680px,calc(100vh-260px))] overflow-auto">
        <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[188px]" />
            <col className="w-[104px]" />
            <col className="w-[76px]" />
            <col className="w-[118px]" />
            <col className="w-[132px]" />
            <col className="w-[170px]" />
            <col />
            <col className="w-[94px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Property</th>
              <th className="px-4 py-3 font-semibold">Unit</th>
              <th className="px-4 py-3 font-semibold">Floor</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Rent</th>
              <th className="px-4 py-3 font-semibold">Lease / Tenant</th>
              <th className="px-4 py-3 font-semibold">Records</th>
              <th className="px-2 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {units.length === 0 ? (
              <tr className="border-t border-border">
                <td className="px-4 py-8 text-center text-muted" colSpan={8}>
                  {getEmptyMessage(archiveState)}
                </td>
              </tr>
            ) : null}
            {units.map((unit) => (
              <tr
                className={[
                  "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  selectedUnitId === unit.id ? "bg-accent-soft" : "",
                  unit.isArchived ? "text-muted" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={unit.id}
                onClick={() => onSelectUnit(unit.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectUnit(unit.id);
                  }
                }}
                tabIndex={0}
              >
                <td className="px-4 py-2.5">
                  <p className="truncate font-medium" title={unit.propertyCode}>
                    {unit.propertyCode}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted" title={unit.propertyName}>
                    {unit.propertyName}
                  </p>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    className="break-words font-medium text-accent hover:underline"
                    href={`/units/${unit.id}`}
                    onClick={(event) => event.stopPropagation()}
                    prefetch={false}
                  >
                    {unit.unitNumber}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-muted">{unit.floorLabel}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
                    {unit.isArchived ? (
                      <Badge tone="warning">Archived</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {unit.rentDisplay ? (
                    <MoneyDisplay align="right" value={unit.rentDisplay} />
                  ) : (
                    <span className="block text-right font-medium">
                      {unit.rentLabel}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <p className="line-clamp-2 break-words">{unit.leaseLabel}</p>
                </td>
                <td className="px-3 py-2.5">
                  <UnitRecordContext unit={unit} />
                </td>
                <td className="px-2 py-2.5">
                  <UnitActions
                    align="right"
                    compact
                    onArchiveUnit={onArchiveUnit}
                    onEditUnit={onEditUnit}
                    onRestoreUnit={onRestoreUnit}
                    unit={unit}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function getEmptyMessage(archiveState: UnitArchiveState) {
  if (archiveState === "archived") {
    return "No archived units.";
  }

  if (archiveState === "all") {
    return "No units yet.";
  }

  return "No active units yet.";
}

function UnitActions({
  align = "left",
  className,
  onArchiveUnit,
  onEditUnit,
  onRestoreUnit,
  unit,
}: {
  align?: "left" | "right";
  className?: string;
  compact?: boolean;
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  unit: UnitSummary;
}) {
  const baseClassName = [
    "flex gap-1",
    align === "right" ? "justify-end" : "justify-start",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const buttonClassName =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50";

  if (unit.isArchived) {
    return (
      <div className={baseClassName}>
        <Link
          aria-label={`Open unit ${unit.unitNumber}`}
          className={`${buttonClassName} hover:text-foreground`}
          href={`/units/${unit.id}`}
          onClick={(event) => event.stopPropagation()}
          prefetch={false}
        >
          <ExternalLink size={15} />
        </Link>
        <Button
          aria-label={`Restore unit ${unit.unitNumber}`}
          className={`${buttonClassName} hover:text-accent`}
          onClick={(event) => {
            event.stopPropagation();
            onRestoreUnit(unit);
          }}
          type="button"
          variant="ghost"
        >
          <RotateCcw size={15} />
        </Button>
      </div>
    );
  }

  return (
    <div className={baseClassName}>
      <Link
        aria-label={`Open unit ${unit.unitNumber}`}
        className={`${buttonClassName} hover:text-foreground`}
        href={`/units/${unit.id}`}
        onClick={(event) => event.stopPropagation()}
        prefetch={false}
      >
        <ExternalLink size={15} />
      </Link>
      <Button
        aria-label={`Edit unit ${unit.unitNumber}`}
        className={`${buttonClassName} hover:text-foreground`}
        onClick={(event) => {
          event.stopPropagation();
          onEditUnit(unit);
        }}
        type="button"
        variant="ghost"
      >
        <Pencil size={15} />
      </Button>
      <Button
        aria-label={`Archive unit ${unit.unitNumber}`}
        className={`${buttonClassName} hover:text-danger`}
        onClick={(event) => {
          event.stopPropagation();
          onArchiveUnit(unit);
        }}
        type="button"
        variant="ghost"
      >
        <Archive size={15} />
      </Button>
    </div>
  );
}

function UnitCardDetail({
  align = "left",
  label,
  value,
}: {
  align?: "left" | "right";
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0"}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

function UnitRecordContext({
  className,
  unit,
}: {
  className?: string;
  unit: UnitSummary;
}) {
  return (
    <div className={className}>
      {unit.latestTimelineEvent ? (
        <>
          <p className="line-clamp-1 text-xs font-medium text-foreground">
            {formatUnitTimelineContext(unit.latestTimelineEvent)}
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-muted">
            {unit.latestTimelineEvent.title}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted">No timeline events yet.</p>
      )}
      <div className="mt-1 text-xs text-muted">
        <span>Ledger net</span>
        <MoneyDisplay
          className="mt-0.5"
          value={unit.ledgerNetDisplay}
          showSecondary={false}
        />
      </div>
    </div>
  );
}
