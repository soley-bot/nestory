"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  UnitArchiveState,
  UnitDisplayMode,
  UnitSortKey,
  UnitSummary,
} from "@/features/units/unit.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const unitRowClassName =
  "cursor-pointer border-t border-border outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const selectedUnitRowClassName =
  "bg-accent shadow-[inset_3px_0_0_var(--record-spine)]";

type UnitsTableProps = {
  displayMode: UnitDisplayMode;
  onArchiveUnit?: (unit: UnitSummary) => void;
  onEditUnit?: (unit: UnitSummary) => void;
  onOpenUnit?: (id: string) => void;
  onRestoreUnit?: (unit: UnitSummary) => void;
  onSelectUnit: (id: string) => void;
  onSortChange: (sort: UnitSortKey) => void;
  selectedUnitId: string;
  sort: UnitSortKey;
  archiveState: UnitArchiveState;
  units: UnitSummary[];
};

export function UnitsTable({
  archiveState,
  displayMode,
  onSelectUnit,
  onSortChange,
  selectedUnitId,
  sort,
  units,
}: UnitsTableProps) {
  return (
    <div className="h-full min-h-0">
      <div
        className={cn(
          displayMode === "cards"
            ? "grid h-full auto-rows-max content-start items-start gap-3 overflow-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3"
            : "max-h-[380px] space-y-3 overflow-auto pr-1 md:hidden",
        )}
      >
        {units.length === 0 ? (
          <p className="rounded-md border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
            {getEmptyMessage(archiveState)}
          </p>
        ) : null}
        {units.map((unit) => (
          <UnitCard
            key={unit.id}
            onSelectUnit={onSelectUnit}
            selected={selectedUnitId === unit.id}
            unit={unit}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div
          className="hidden h-full min-w-0 overflow-hidden md:block"
          data-slot="register-table-frame"
        >
          <div className="h-full overflow-auto">
            <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[22%]" />
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
                  <th className="px-1.5 py-2.5 font-semibold">
                    Lease / Tenant
                  </th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                      {getEmptyMessage(archiveState)}
                    </td>
                  </tr>
                ) : null}
                {units.map((unit) => (
                  <tr
                    aria-label={`Preview unit ${unit.unitNumber}`}
                    aria-selected={selectedUnitId === unit.id}
                    className={cn(
                      unitRowClassName,
                      selectedUnitId === unit.id && selectedUnitRowClassName,
                      unit.isArchived && "text-muted-foreground",
                    )}
                    key={unit.id}
                    onClick={() => onSelectUnit(unit.id)}
                    onKeyDown={(event) => {
                      if (event.currentTarget !== event.target) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectUnit(unit.id);
                      }
                    }}
                    tabIndex={0}
                    title={`Preview unit ${unit.unitNumber}`}
                  >
                    <td className="px-2.5 py-2">
                      <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5">
                        <UnitThumbnail unit={unit} />
                        <div className="min-w-0">
                          <p
                            className="truncate font-medium"
                            title={unit.propertyCode}
                          >
                            {unit.propertyCode}
                          </p>
                          <p
                            className="mt-0.5 truncate text-xs text-muted-foreground"
                            title={unit.propertyName}
                          >
                            {unit.propertyName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-2">
                      <p
                        className="truncate font-medium text-foreground"
                        title={`Unit ${unit.unitNumber}`}
                      >
                        {unit.unitNumber}
                      </p>
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
                    <td className="px-2 py-2">
                      <TableMoneyDisplay value={unit.ledgerNetDisplay} />
                    </td>
                    <td className="px-1.5 py-2">
                      <p className="line-clamp-2 break-words leading-[18px]">
                        {unit.leaseLabel}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
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

function UnitCard({
  onSelectUnit,
  selected,
  unit,
}: {
  onSelectUnit: (id: string) => void;
  selected: boolean;
  unit: UnitSummary;
}) {
  return (
    <article
      aria-label={`Preview unit ${unit.unitNumber}`}
      aria-pressed={selected}
      className={cn(
        "group min-w-0 cursor-pointer overflow-hidden rounded-md border border-border bg-card text-sm outline-none transition-colors hover:border-record-spine focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-record-spine bg-accent",
        unit.isArchived && "text-muted-foreground",
      )}
      data-selected={selected ? "true" : "false"}
      onClick={() => onSelectUnit(unit.id)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectUnit(unit.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <UnitPhoto unit={unit} />

      <div className="px-3 py-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="truncate text-sm font-semibold leading-5 text-foreground"
              title={`Unit ${unit.unitNumber}`}
            >
              Unit {unit.unitNumber}
            </p>
            <p className="mt-1 truncate font-medium" title={unit.propertyName}>
              {unit.propertyName}
            </p>
            <p
              className="mt-0.5 truncate text-sm text-muted-foreground"
              title={unit.propertyCode}
            >
              {unit.propertyCode}
            </p>
          </div>
          <UnitStatusBadges unit={unit} />
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-end gap-3">
            {unit.rentDisplay ? (
              <TableMoneyDisplay value={unit.rentDisplay} />
            ) : (
              <span className="font-semibold">{unit.rentLabel}</span>
            )}
          </div>
          <p className="line-clamp-2 leading-5 text-muted-foreground">
            {unit.leaseLabel}
          </p>
        </div>

        <p className="mt-3 border-t border-border pt-2 text-xs font-medium text-muted-foreground">
          Open quick view
        </p>
      </div>
    </article>
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

function UnitStatusBadges({ unit }: { unit: UnitSummary }) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
      <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
      {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
    </div>
  );
}

function UnitThumbnail({ unit }: { unit: UnitSummary }) {
  const className =
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground";

  if (unit.thumbnailUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn(className, "bg-cover bg-center")}
        style={{ backgroundImage: `url(${unit.thumbnailUrl})` }}
      />
    );
  }

  return (
    <span className={className} aria-hidden="true">
      <Building2 size={16} />
    </span>
  );
}

function UnitPhoto({ unit }: { unit: UnitSummary }) {
  const className =
    "flex h-36 w-full items-center justify-center bg-muted text-muted-foreground";

  if (unit.thumbnailUrl) {
    return (
      <div
        aria-hidden="true"
        className={cn(className, "bg-cover bg-center")}
        style={{ backgroundImage: `url(${unit.thumbnailUrl})` }}
      />
    );
  }

  return (
    <div className={className} aria-hidden="true">
      <Building2 size={24} />
    </div>
  );
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
