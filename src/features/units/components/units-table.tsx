import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, ExternalLink, Pencil, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatUnitTimelineContext } from "@/features/units/data/unit-summary";
import type {
  UnitArchiveState,
  UnitSummary,
} from "@/features/units/unit.types";
import type {
  CurrencyCode,
  MoneyDisplayValue,
} from "@/lib/money/format";
import { cn } from "@/lib/utils";

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
                    <TableMoneyDisplay value={unit.rentDisplay} />
                  ) : (
                    unit.rentLabel
                  )
                }
                align="right"
              />
              <UnitCardDetail label="Lease" value={unit.leaseLabel} />
              <UnitCardDetail
                label="Ledger net"
                value={<TableMoneyDisplay value={unit.ledgerNetDisplay} />}
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
          <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[7%]" />
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
            <col className="w-[15%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-2.5 py-2.5 font-semibold">Property</th>
              <th className="px-1.5 py-2.5 font-semibold">Unit</th>
              <th className="px-1.5 py-2.5 text-center font-semibold">Floor</th>
              <th className="px-1.5 py-2.5 text-center font-semibold">
                Status
              </th>
              <th className="px-2 py-2.5 text-right font-semibold">Rent</th>
              <th className="px-1.5 py-2.5 font-semibold">Lease / Tenant</th>
              <th className="px-1.5 py-2.5 font-semibold">Records</th>
              <th className="px-1.5 py-2.5 text-center font-semibold">
                Actions
              </th>
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
                <td className="px-2.5 py-2">
                  <p className="truncate font-medium" title={unit.propertyCode}>
                    {unit.propertyCode}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs text-muted"
                    title={unit.propertyName}
                  >
                    {unit.propertyName}
                  </p>
                </td>
                <td className="px-1.5 py-2">
                  <Link
                    className="block truncate font-medium text-accent hover:underline"
                    href={`/units/${unit.id}`}
                    onClick={(event) => event.stopPropagation()}
                    prefetch={false}
                    title={`Unit ${unit.unitNumber}`}
                  >
                    {unit.unitNumber}
                  </Link>
                </td>
                <td className="px-1.5 py-2 text-center text-muted">
                  {unit.floorLabel}
                </td>
                <td className="px-1.5 py-2">
                  <div className="flex flex-wrap justify-center gap-1.5">
                    <Badge className="px-2 text-xs" tone={unit.statusTone}>
                      {unit.statusLabel}
                    </Badge>
                    {unit.isArchived ? (
                      <Badge className="px-2 text-xs" tone="warning">
                        Archived
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-2">
                  {unit.rentDisplay ? (
                    <TableMoneyDisplay value={unit.rentDisplay} />
                  ) : (
                    <span className="block text-right font-medium">
                      {unit.rentLabel}
                    </span>
                  )}
                </td>
                <td className="px-1.5 py-2">
                  <p className="line-clamp-2 break-words leading-[18px]">
                    {unit.leaseLabel}
                  </p>
                </td>
                <td className="px-1.5 py-2">
                  <UnitRecordContext unit={unit} />
                </td>
                <td className="px-1.5 py-2">
                  <UnitActions
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
  className,
  onArchiveUnit,
  onEditUnit,
  onRestoreUnit,
  unit,
}: {
  className?: string;
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  unit: UnitSummary;
}) {
  const baseClassName = cn("flex justify-center gap-0.5", className);
  const buttonClassName =
    "inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50";

  if (unit.isArchived) {
    return (
      <div className={baseClassName}>
        <Link
          aria-label={`Open unit ${unit.unitNumber}`}
          className={`${buttonClassName} hover:text-foreground`}
          href={`/units/${unit.id}`}
          onClick={(event) => event.stopPropagation()}
          prefetch={false}
          title="Open unit"
        >
          <ExternalLink size={14} />
        </Link>
        <button
          aria-label={`Restore unit ${unit.unitNumber}`}
          className={`${buttonClassName} hover:text-accent`}
          onClick={(event) => {
            event.stopPropagation();
            onRestoreUnit(unit);
          }}
          title="Restore unit"
          type="button"
        >
          <RotateCcw size={14} />
        </button>
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
        title="Open unit"
      >
        <ExternalLink size={14} />
      </Link>
      <button
        aria-label={`Edit unit ${unit.unitNumber}`}
        className={`${buttonClassName} hover:text-foreground`}
        onClick={(event) => {
          event.stopPropagation();
          onEditUnit(unit);
        }}
        title="Edit unit"
        type="button"
      >
        <Pencil size={14} />
      </button>
      <button
        aria-label={`Archive unit ${unit.unitNumber}`}
        className={`${buttonClassName} hover:text-danger`}
        onClick={(event) => {
          event.stopPropagation();
          onArchiveUnit(unit);
        }}
        title="Archive unit"
        type="button"
      >
        <Archive size={14} />
      </button>
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
      <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs text-muted">
        <span className="shrink-0">Ledger net</span>
        <TableMoneyDisplay
          compact
          showSecondary={false}
          value={unit.ledgerNetDisplay}
        />
      </div>
    </div>
  );
}

function TableMoneyDisplay({
  compact = false,
  showSecondary = true,
  value,
}: {
  compact?: boolean;
  showSecondary?: boolean;
  value: MoneyDisplayValue;
}) {
  const primary = formatMoneyWithSymbol(value.primary, value.primaryCurrency);
  const secondary = formatMoneyWithSymbol(
    value.secondary,
    value.secondaryCurrency,
  );

  return (
    <span
      className={cn(
        "flex min-w-0 items-center justify-end whitespace-nowrap text-right tabular-nums",
        compact ? "gap-1 text-xs leading-4" : "gap-1.5 text-sm leading-5",
      )}
      title={showSecondary ? `${primary} / ${secondary}` : primary}
    >
      <span className="font-semibold text-foreground">{primary}</span>
      {showSecondary ? (
        <>
          <span className="text-muted">/</span>
          <span
            className={compact ? "text-xs text-muted" : "text-[13px] text-muted"}
          >
            {secondary}
          </span>
        </>
      ) : null}
    </span>
  );
}

function formatMoneyWithSymbol(label: string, currency: CurrencyCode) {
  const isNegative = label.startsWith("-");
  const unsignedLabel = isNegative ? label.slice(1) : label;
  const codePrefix = `${currency} `;
  const amount = unsignedLabel.startsWith(codePrefix)
    ? unsignedLabel.slice(codePrefix.length)
    : unsignedLabel;
  const symbol = currency === "USD" ? "$" : "\u17db";

  return `${isNegative ? "-" : ""}${symbol}${amount}`;
}
