"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import {
  RecordLink,
  registerRowClassName,
} from "@/components/data/interactive-table";
import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/features/properties/data/properties";
import type { PropertySortKey } from "@/features/properties/property.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type PropertiesTableProps = {
  onNetSortChange: () => void;
  onOpenProperty: (id: string) => void;
  onSortChange: (sort: PropertySortKey) => void;
  properties: PropertySummary[];
  sort: PropertySortKey;
};

export function PropertiesTable({
  onNetSortChange,
  onOpenProperty,
  onSortChange,
  properties,
  sort,
}: PropertiesTableProps) {
  return (
    <div className="min-w-0">
      <ul
        aria-label="Properties"
        className="workspace-gutter-x divide-y divide-border px-4 sm:px-6 lg:hidden 2xl:px-8"
        data-property-record-list="list"
      >
        {properties.map((property) => (
          <PropertyRow key={property.id} onOpenProperty={onOpenProperty} property={property} />
        ))}
      </ul>

      <div
        className="workspace-gutter-x hidden min-w-0 px-4 sm:px-6 lg:block 2xl:px-8"
        data-slot="register-table-frame"
      >
        <div aria-label="Properties table" className="overflow-x-auto" role="region">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[23%]" />
              <col className="w-[18%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[3%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-xs uppercase tracking-[0.04em] text-muted-foreground shadow-[0_1px_0_var(--border)]">
              <tr>
                <SortableHeader
                  active={sort === "code_asc"}
                  direction="ascending"
                  label="Property"
                  onClick={() => onSortChange("code_asc")}
                  sortLabel="Order property records"
                />
                <th className="px-1.5 py-2.5 font-semibold">Owner</th>
                <th className="px-1.5 py-2.5 font-semibold">Occupancy</th>
                <th className="px-1.5 py-2.5 font-semibold">Leases</th>
                <SortableHeader
                  active={sort === "net_asc" || sort === "net_desc"}
                  align="right"
                  direction={sort === "net_asc" ? "ascending" : "descending"}
                  label="Net"
                  onClick={onNetSortChange}
                  sortLabel="Sort properties by net"
                />
                <SortableHeader
                  active={sort === "status_asc"}
                  align="center"
                  direction="ascending"
                  label="Status"
                  onClick={() => onSortChange("status_asc")}
                  sortLabel="Sort properties by status"
                />
                <th aria-label="Open property" className="px-1 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {properties.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                    No properties match the current filters.
                  </td>
                </tr>
              ) : null}
              {properties.map((property) => (
                <tr
                  aria-label={`Open ${property.name}`}
                  className={cn(
                    registerRowClassName,
                    "cursor-pointer",
                    property.isArchived && "text-muted-foreground",
                  )}
                  key={property.id}
                  onClick={(event) => {
                    if (
                      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
                      (event.target as Element).closest("a, button, input, select, textarea, [role='button'], [role='link'], [contenteditable='true']")
                    ) {
                      return;
                    }
                    onOpenProperty(property.id);
                  }}
                  title={`Open ${property.name}`}
                >
                  <td className="px-2.5 py-1.5">
                    <div className="flex min-w-0 max-w-[20rem] items-center gap-2">
                      <PropertyThumbnail property={property} />
                      <div className="min-w-0 flex-1">
                        <RecordLink
                          className="items-start py-0 [&>span]:min-w-0 [&>span]:overflow-visible [&>span]:whitespace-normal [&>span]:[overflow-wrap:anywhere]"
                          href={`/properties/${property.id}`}
                          onClick={(event) => {
                            if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                              event.preventDefault();
                              onOpenProperty(property.id);
                            }
                          }}
                          title={property.name}
                        >
                          {property.name}
                        </RecordLink>
                        <p
                          className="whitespace-normal [overflow-wrap:anywhere] text-xs text-muted-foreground"
                          title={`${property.code} / ${property.type}`}
                        >
                          {property.code} / {property.type}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-1.5 py-2">
                    <p
                      className="max-w-[14rem] whitespace-normal [overflow-wrap:anywhere] text-sm font-medium"
                      title={property.owner}
                    >
                      {property.owner}
                    </p>
                    {!property.hasActiveOwnerLink ? (
                      <p className="mt-0.5 text-xs text-warning">Owner link needed</p>
                    ) : null}
                  </td>
                  <td className="px-1.5 py-2">
                    <TableOccupancy property={property} />
                  </td>
                  <td className="px-1.5 py-2">
                    <TableLeaseHealth property={property} />
                  </td>
                  <td className="px-1.5 py-2">
                    <TableMoneyDisplay value={property.netIncome} />
                  </td>
                  <td className="px-1.5 py-2">
                    <PropertyStatusBadges compact property={property} />
                  </td>
                  <td className="px-1 py-2 text-right text-muted-foreground">
                    <ChevronRight aria-hidden="true" className="ml-auto size-4" />
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

function PropertyRow({ onOpenProperty, property }: {
  onOpenProperty: (id: string) => void;
  property: PropertySummary;
}) {
  return (
    <li className="min-w-0 py-2.5 text-sm" data-slot="compact-record-row">
      <div className="flex min-w-0 items-center gap-2">
        <button
          aria-label={`Open ${property.name}`}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-sm text-left font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpenProperty(property.id)}
          type="button"
        >
          <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{property.name}</span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <PropertyStatusBadges compact property={property} />
      </div>
      <p className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{property.code} / {property.type}</p>
      <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Owner</dt>
          <dd className="[overflow-wrap:anywhere]">{property.owner}{!property.hasActiveOwnerLink ? <span className="block text-xs text-warning">Owner link needed</span> : null}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Occupancy</dt>
          <dd className="tabular-nums">{property.occupiedUnits}/{property.units} occupied · {Math.max(0, property.units - property.occupiedUnits)} open</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Leases</dt>
          <dd className="[&_span]:whitespace-normal"><TableLeaseHealth property={property} /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Net</dt>
          <dd className="font-semibold tabular-nums [overflow-wrap:anywhere]">{formatMoneyWithSymbol(property.netIncome.primary)}</dd>
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

function PropertyStatusBadges({
  compact = false,
  property,
}: {
  compact?: boolean;
  property: PropertySummary;
}) {
  const badgeClassName = cn(
    compact
      ? "border px-1.5 py-0.5 text-xs font-semibold"
      : "border-2 px-2.5 py-1 text-xs font-semibold shadow-sm",
    !compact && "backdrop-blur",
  );

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap gap-1.5",
        compact && "justify-center",
      )}
    >
      <Badge className={badgeClassName} tone={property.statusTone}>
        {property.status}
      </Badge>
      {property.isArchived ? (
        <Badge className={badgeClassName} tone="warning">
          Archived
        </Badge>
      ) : null}
    </div>
  );
}

function occupancyToneClass(percent: number) {
  if (percent < 50) {
    return "text-danger";
  }

  if (percent < 85) {
    return "text-warning";
  }

  return "text-success";
}

function occupancyBarClass(percent: number) {
  if (percent < 50) {
    return "bg-danger/80";
  }

  if (percent < 85) {
    return "bg-warning/80";
  }

  return "bg-success/80";
}

function TableMoneyDisplay({ value }: { value: MoneyDisplayValue }) {
  const primary = formatMoneyWithSymbol(value.primary);

  return (
    <span
      className="flex min-w-0 items-center justify-end gap-1.5 whitespace-nowrap text-right text-sm leading-5 tabular-nums"
      title={primary}
    >
      <span className="font-semibold text-foreground">{primary}</span>
    </span>
  );
}

function PropertyThumbnail({ property }: { property: PropertySummary }) {
  if (!property.thumbnailUrl) {
    return null;
  }
  return (
    <span
      aria-hidden="true"
      className="size-8 shrink-0 rounded-sm bg-cover bg-center"
      style={{ backgroundImage: `url(${property.thumbnailUrl})` }}
    />
  );
}

function TableOccupancy({ property }: { property: PropertySummary }) {
  const occupancyRate =
    property.units > 0
      ? Math.round((property.occupiedUnits / property.units) * 100)
      : 0;
  const openUnits = Math.max(0, property.units - property.occupiedUnits);

  return (
    <div title={`${occupancyRate}% occupied, ${openUnits} open`}>
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            occupancyToneClass(occupancyRate),
          )}
        >
          {occupancyRate}%
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{openUnits} open</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chart-track">
        <span
          className={cn("block h-full rounded-full", occupancyBarClass(occupancyRate))}
          style={{ width: `${Math.max(occupancyRate, property.units > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function TableLeaseHealth({ property }: { property: PropertySummary }) {
  const hasMissingLease =
    property.units > 0
      ? property.unitsWithoutCurrentLease > 0
      : property.currentLeaseCount === 0;

  if (hasMissingLease) {
    const label =
      property.units > 0
        ? `${property.unitsWithoutCurrentLease} without lease`
        : "No current lease";

    return <span className="whitespace-nowrap font-medium text-warning">{label}</span>;
  }

  return (
    <span className="whitespace-nowrap font-medium text-muted-foreground">
      {property.currentLeaseCount} active {property.currentLeaseCount === 1 ? "lease" : "leases"}
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
