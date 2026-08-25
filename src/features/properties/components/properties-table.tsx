"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import {
  RecordLink,
  registerRowClassName,
} from "@/components/data/interactive-table";
import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/features/properties/data/properties";
import type {
  PropertyDisplayMode,
  PropertySortKey,
} from "@/features/properties/property.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type PropertiesTableProps = {
  displayMode: PropertyDisplayMode;
  onOpenProperty: (id: string) => void;
  onSortChange: (sort: PropertySortKey) => void;
  properties: PropertySummary[];
  sort: PropertySortKey;
};

export function PropertiesTable({
  displayMode,
  onOpenProperty,
  onSortChange,
  properties,
  sort,
}: PropertiesTableProps) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "workspace-gutter-x px-4 sm:px-6 2xl:px-8",
          displayMode === "cards"
            ? "grid auto-rows-max content-start items-start gap-3 sm:grid-cols-2 2xl:grid-cols-3"
            : "space-y-3 md:hidden",
        )}
        data-property-record-list={displayMode}
      >
        {properties.length === 0 ? (
          <p className="rounded-md border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground sm:col-span-2 2xl:col-span-3">
            No properties match the current filters.
          </p>
        ) : null}
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            onOpenProperty={onOpenProperty}
            property={property}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div
          className="workspace-gutter-x hidden min-w-0 px-4 sm:px-6 md:block 2xl:px-8"
          data-slot="register-table-frame"
        >
          <div aria-label="Properties table" className="overflow-x-auto" role="region">
            <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[18%]" />
                <col className="w-[13%]" />
                <col className="w-[15%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[3%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-[11px] uppercase tracking-[0.04em] text-muted-foreground shadow-[0_1px_0_var(--border)]">
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
                  <th className="px-1.5 py-2.5 font-semibold">Lease health</th>
                  <SortableHeader
                    active={sort === "net_asc" || sort === "net_desc"}
                    align="right"
                    direction={sort === "net_asc" ? "ascending" : "descending"}
                    label="Net"
                    onClick={() =>
                      onSortChange(sort === "net_desc" ? "net_asc" : "net_desc")
                    }
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
                      property.isArchived && "text-muted-foreground",
                    )}
                    key={property.id}
                    onClick={() => onOpenProperty(property.id)}
                    onKeyDown={(event) => {
                      if (event.currentTarget !== event.target) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenProperty(property.id);
                      }
                    }}
                    tabIndex={0}
                    title={`Open ${property.name}`}
                  >
                    <td className="px-2.5 py-2">
                      <div className="grid min-w-0 max-w-[20rem] grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5">
                        <PropertyThumbnail property={property} />
                        <div className="min-w-0">
                          <RecordLink
                            href={`/properties/${property.id}`}
                            title={property.name}
                          >
                            {property.name}
                          </RecordLink>
                          <p
                            className="mt-0.5 truncate text-xs text-muted-foreground"
                            title={`${property.code} / ${property.type}`}
                          >
                            {property.code} / {property.type}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-2">
                      <p
                        className="max-w-[14rem] truncate text-sm font-medium"
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
      ) : null}
    </div>
  );
}

function PropertyCard({
  onOpenProperty,
  property,
}: {
  onOpenProperty: (id: string) => void;
  property: PropertySummary;
}) {
  const attention = getPropertyCardAttention(property);

  return (
    <article
      aria-label={`Open ${property.name}`}
      className={cn(
        "group min-w-0 cursor-pointer overflow-hidden rounded-md border border-border bg-card text-sm outline-none transition-colors hover:border-record-spine focus-visible:ring-2 focus-visible:ring-ring",
        property.isArchived && "text-muted-foreground",
      )}
      onClick={() => onOpenProperty(property.id)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenProperty(property.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <PropertyThumbnail property={property} size="card" />

      <div className="grid min-w-0 gap-1 p-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p
            className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            title={property.code}
          >
            {property.code}
          </p>
          <PropertyStatusBadges compact property={property} />
        </div>

        <div className="min-w-0">
          <p
            className="truncate text-sm font-semibold leading-5 text-foreground"
            title={property.name}
          >
            {property.name}
          </p>
          <p
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={property.type}
          >
            {property.type}
          </p>
        </div>

        {attention ? (
          <Badge className="w-fit px-1.5 py-0.5 text-xs" tone={attention.tone}>
            {attention.label}
          </Badge>
        ) : null}

        <p className="mt-1 border-t border-border pt-2 text-xs font-medium text-muted-foreground">
          Open property
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

function getPropertyCardAttention(property: PropertySummary) {
  const openUnits = Math.max(0, property.units - property.occupiedUnits);

  if (openUnits > 0) {
    return { label: `${openUnits} open`, tone: "warning" as const };
  }

  if (!property.hasActiveOwnerLink) {
    return { label: "Owner needed", tone: "warning" as const };
  }

  if (property.netIncomeUsd < 0) {
    return { label: "Negative net", tone: "danger" as const };
  }

  return null;
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

function PropertyThumbnail({
  property,
  size = "small",
}: {
  property: PropertySummary;
  size?: "card" | "large" | "small";
}) {
  const className = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground",
    size === "card"
      ? "h-36 w-full rounded-b-none border-x-0 border-t-0"
      : size === "large"
        ? "size-[52px]"
        : "size-10",
  );

  if (property.thumbnailUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn(className, "bg-cover bg-center")}
        style={{ backgroundImage: `url(${property.thumbnailUrl})` }}
      />
    );
  }

  return (
    <span className={cn(className, "px-2 text-center")} aria-hidden="true">
      {size === "card" ? (
        <span className="grid gap-1">
          <span className="text-sm font-semibold text-muted-foreground">
            {getPropertyInitials(property)}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide">
            Needs photo
          </span>
        </span>
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {getPropertyInitials(property)}
        </span>
      )}
    </span>
  );
}

function getPropertyInitials(property: PropertySummary) {
  const codeParts = property.code
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (codeParts.length > 0) {
    return codeParts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  return property.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
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
