"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RecordLink } from "@/components/data/interactive-table";
import { formatUnitOperationalReadiness } from "@/features/units/data/unit-summary";
import type {
  UnitArchiveState,
  UnitSortKey,
  UnitSummary,
} from "@/features/units/unit.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const unitRowClassName =
  "cursor-pointer border-t border-border transition-colors hover:bg-muted/70";
type UnitsTableProps = {
  onSelectUnit: (id: string) => void;
  onSortChange: (sort: UnitSortKey) => void;
  sort: UnitSortKey;
  archiveState: UnitArchiveState;
  units: UnitSummary[];
};

export function UnitsTable({
  archiveState,
  onSelectUnit,
  onSortChange,
  sort,
  units,
}: UnitsTableProps) {
  return (
    <div className="min-w-0">
      <ul aria-label="Units" className="divide-y divide-border lg:hidden" data-unit-record-list="list">
        {units.length === 0 ? <li className="py-8 text-center text-sm text-muted-foreground">{getEmptyMessage(archiveState)}</li> : null}
        {units.map((unit) => <UnitRow key={unit.id} onSelectUnit={onSelectUnit} unit={unit} />)}
      </ul>

      <div
        className="hidden min-w-0 lg:block"
        data-slot="register-table-frame"
      >
        <div aria-label="Units table" className="overflow-x-auto" role="region">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-xs uppercase tracking-[0] text-muted-foreground shadow-[0_1px_0_var(--border)]">
              <tr>
                <SortableHeader
                  active={sort === "property_asc"}
                  direction="ascending"
                  label="Property"
                  onClick={() => onSortChange("property_asc")}
                  sortLabel="Sort units by property"
                />
                <SortableHeader
                  active={sort === "unit_asc"}
                  direction="ascending"
                  label="Unit"
                  onClick={() => onSortChange("unit_asc")}
                  sortLabel="Sort units by unit number"
                />
                <SortableHeader
                  active={sort === "status_asc"}
                  align="center"
                  direction="ascending"
                  label="Status"
                  onClick={() => onSortChange("status_asc")}
                  sortLabel="Sort units by status"
                />
                <th className="px-1.5 py-2.5 font-semibold">Lease</th>
                <th className="px-1.5 py-2.5 font-semibold">Tenant</th>
                <SortableHeader
                  active={sort === "rent_desc"}
                  align="right"
                  direction="descending"
                  label="Rent"
                  onClick={() => onSortChange("rent_desc")}
                  sortLabel="Sort units by rent"
                />
                <SortableHeader
                  active={sort === "net_desc"}
                  align="right"
                  direction="descending"
                  label="Net"
                  onClick={() => onSortChange("net_desc")}
                  sortLabel="Sort units by net"
                />
              </tr>
            </thead>
            <tbody>
              {units.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                    {getEmptyMessage(archiveState)}
                  </td>
                </tr>
              ) : null}
              {units.map((unit, index) => {
                const startsPropertyGroup =
                  index === 0 || units[index - 1]?.propertyId !== unit.propertyId;
                const propertyGroupSize = startsPropertyGroup
                  ? getConsecutivePropertyCount(units, index)
                  : 0;

                return (
                <tr
                  aria-label={`Open unit ${unit.unitNumber}`}
                  className={cn(
                    unitRowClassName,
                    startsPropertyGroup && index > 0 && "border-t-2 border-border",
                    unit.isArchived && "text-muted-foreground",
                  )}
                  key={unit.id}
                  onClick={(event) => {
                    if (
                      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
                      (event.target as Element).closest("a, button, input, select, textarea, [role='button'], [role='link'], [contenteditable='true']")
                    ) {
                      return;
                    }
                    onSelectUnit(unit.id);
                  }}
                  title={`Open unit ${unit.unitNumber}`}
                >
                  {startsPropertyGroup ? (
                    <td
                      className="cursor-default whitespace-nowrap bg-card px-3.5 py-2.5 align-top"
                      onClick={(event) => event.stopPropagation()}
                      rowSpan={propertyGroupSize}
                      title="Property group"
                    >
                      <div className="min-w-0 max-w-[18rem] leading-4">
                        <p className="whitespace-normal [overflow-wrap:anywhere] font-medium" title={unit.propertyName}>
                          {unit.propertyName}
                        </p>
                        <p className="whitespace-normal [overflow-wrap:anywhere] text-xs text-muted-foreground" title={unit.propertyOwnerName}>
                          {unit.propertyOwnerName}
                        </p>
                      </div>
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-2 py-2.5">
                    <RecordLink
                      aria-label={`View unit ${unit.unitNumber} details`}
                      className="py-0"
                      href={`/units/${unit.id}`}
                      onClick={(event) => {
                        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                          event.preventDefault();
                          onSelectUnit(unit.id);
                        }
                      }}
                      title={`Unit ${unit.unitNumber}`}
                    >
                      {unit.unitNumber}
                    </RecordLink>
                  </td>
                  <td className="w-px whitespace-nowrap px-1.5 py-2.5 text-center">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <Badge
                        className="px-2 text-xs"
                        tone={getOperationalReadinessTone(unit)}
                      >
                        {formatUnitOperationalReadiness(unit.readiness.operational)}
                      </Badge>
                      {unit.isArchived ? (
                        <Badge className="px-2 text-xs" tone="warning">
                          Archived
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-2.5">
                    <p className="whitespace-normal [overflow-wrap:anywhere]" title={unit.leaseStatusLabel}>
                      {unit.leaseStatusLabel}
                    </p>
                  </td>
                  <td className="w-px whitespace-nowrap px-1.5 py-2.5">
                    <p className="max-w-[10rem] whitespace-normal [overflow-wrap:anywhere]" title={unit.tenantName}>
                      {unit.tenantName}
                    </p>
                  </td>
                  <td className="w-px whitespace-nowrap px-2 py-2.5">
                    {unit.rentDisplay ? (
                      <TableMoneyDisplay value={unit.rentDisplay} />
                    ) : (
                      <span className="block text-right font-medium text-muted-foreground">
                        —
                      </span>
                    )}
                  </td>
                  <td className="w-px whitespace-nowrap px-2 py-2.5">
                    <TableMoneyDisplay value={unit.ledgerNetDisplay} />
                  </td>
                </tr>
                );
              })}
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

function UnitRow({ onSelectUnit, unit }: {
  onSelectUnit: (id: string) => void;
  unit: UnitSummary;
}) {
  return (
    <li className="min-w-0 py-2.5 text-sm" data-slot="compact-record-row">
      <div className="flex min-w-0 items-center gap-2">
        <button
          aria-label={`Open unit ${unit.unitNumber}`}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-sm text-left font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onSelectUnit(unit.id)}
          type="button"
        >
          <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">Unit {unit.unitNumber}</span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Badge tone={getOperationalReadinessTone(unit)}>{formatUnitOperationalReadiness(unit.readiness.operational)}</Badge>
          {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
        </div>
      </div>
      <p className="font-medium [overflow-wrap:anywhere]">{unit.propertyName}</p>
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Owner: {unit.propertyOwnerName}</p>
      <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Tenant</dt>
          <dd className="[overflow-wrap:anywhere]">{unit.tenantName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Lease</dt>
          <dd className="[overflow-wrap:anywhere]">{unit.leaseStatusLabel}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Rent</dt>
          <dd className="font-semibold tabular-nums [overflow-wrap:anywhere]">{unit.rentDisplay ? formatMoneyWithSymbol(unit.rentDisplay.primary) : unit.rentLabel}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Net</dt>
          <dd className="font-semibold tabular-nums [overflow-wrap:anywhere]">{formatMoneyWithSymbol(unit.ledgerNetDisplay.primary)}</dd>
        </div>
      </dl>
    </li>
  );
}

function SortableHeader({
  active,
  align = "left",
  direction,
  label,
  onClick,
  sortLabel,
}: {
  active: boolean;
  align?: "center" | "left" | "right";
  direction: "ascending" | "descending";
  label: string;
  onClick: () => void;
  sortLabel: string;
}) {
  const SortIcon = active
    ? direction === "ascending"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th
      aria-sort={active ? direction : "none"}
      className="px-1.5 py-1.5 font-semibold"
    >
      <button
        aria-label={sortLabel}
        className={cn(
          "flex h-7 w-full items-center gap-1 rounded px-1 outline-none transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring",
          align === "center" && "justify-center",
          align === "right" && "justify-end",
        )}
        onClick={onClick}
        type="button"
      >
        <span>{label}</span>
        <SortIcon aria-hidden="true" className="size-3" />
      </button>
    </th>
  );
}

function getOperationalReadinessTone(unit: UnitSummary) {
  if (unit.readiness.operational === "maintenance") {
    return "warning" as const;
  }

  if (unit.readiness.operational === "inactive") {
    return "danger" as const;
  }

  return "success" as const;
}

function getConsecutivePropertyCount(units: UnitSummary[], startIndex: number) {
  const propertyId = units[startIndex]?.propertyId;
  let count = 0;

  for (let index = startIndex; index < units.length; index += 1) {
    if (units[index]?.propertyId !== propertyId) {
      break;
    }

    count += 1;
  }

  return count;
}

function TableMoneyDisplay({
  compact = false,
  value,
}: {
  compact?: boolean;
  value: MoneyDisplayValue;
}) {
  const primary = formatMoneyWithSymbol(value.primary);

  return (
    <span
      className={cn(
        "flex min-w-0 items-center justify-end whitespace-nowrap text-right tabular-nums",
        compact ? "gap-1 text-xs leading-4" : "gap-1.5 text-sm leading-5",
      )}
      title={primary}
    >
      <span className="font-semibold text-foreground">{primary}</span>
    </span>
  );
}

function formatMoneyWithSymbol(label: string) {
  const isNegative = label.startsWith("-");
  const unsignedLabel = isNegative ? label.slice(1) : label;
  const codePrefix = "USD ";
  const amount = unsignedLabel.startsWith(codePrefix)
    ? unsignedLabel.slice(codePrefix.length)
    : unsignedLabel;

  return `${isNegative ? "-" : ""}$${amount}`;
}
