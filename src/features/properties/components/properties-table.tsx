import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/features/properties/data/properties";
import type {
  PropertyDisplayMode,
  PropertySortKey,
} from "@/features/properties/property.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const propertyRowClassName =
  "cursor-pointer border-t border-border outline-none transition-colors hover:bg-surface-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring";
const selectedPropertyRowClassName =
  "bg-state-selected shadow-[inset_3px_0_0_var(--record-spine)]";

type PropertiesTableProps = {
  displayMode: PropertyDisplayMode;
  onSelectProperty: (id: string) => void;
  onSortChange: (sort: PropertySortKey) => void;
  properties: PropertySummary[];
  selectedPropertyId: string;
  sort: PropertySortKey;
};

export function PropertiesTable({
  displayMode,
  onSelectProperty,
  onSortChange,
  properties,
  selectedPropertyId,
  sort,
}: PropertiesTableProps) {
  return (
    <div className="h-full min-h-0">
      <div
        className={cn(
          displayMode === "cards"
            ? "grid h-full min-h-[380px] auto-rows-max content-start items-start gap-3 overflow-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3"
            : "max-h-[380px] space-y-3 overflow-auto pr-1 md:hidden",
        )}
        data-property-record-list={displayMode}
      >
        {properties.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted sm:col-span-2 2xl:col-span-3">
            No properties match the current filters.
          </p>
        ) : null}
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            onSelectProperty={onSelectProperty}
            property={property}
            selected={selectedPropertyId === property.id}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div className="hidden h-full overflow-hidden rounded-md border border-border bg-surface md:block">
          <div className="h-full min-h-[540px] overflow-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
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
                  <th className="px-1.5 py-2.5 font-semibold">Open</th>
                  <SortableHeader
                    active={sort === "status_asc"}
                    align="center"
                    direction="ascending"
                    label="Status"
                    onClick={() => onSortChange("status_asc")}
                    sortLabel="Sort properties by status"
                  />
                </tr>
              </thead>
              <tbody>
                {properties.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-8 text-center text-muted" colSpan={6}>
                      No properties match the current filters.
                    </td>
                  </tr>
                ) : null}
                {properties.map((property) => (
                  <tr
                    aria-selected={selectedPropertyId === property.id}
                    className={cn(
                      propertyRowClassName,
                      selectedPropertyId === property.id &&
                        selectedPropertyRowClassName,
                      property.isArchived && "text-muted",
                    )}
                    key={property.id}
                    onClick={() => onSelectProperty(property.id)}
                    onKeyDown={(event) => {
                      if (event.currentTarget !== event.target) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectProperty(property.id);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-2.5 py-2">
                      <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5">
                        <PropertyThumbnail property={property} />
                        <div className="min-w-0">
                          <Link
                            className="block truncate rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                            href={`/properties/${property.id}`}
                            onClick={(event) => event.stopPropagation()}
                            prefetch={false}
                            title={property.name}
                          >
                            {property.name}
                          </Link>
                          <p
                            className="mt-0.5 truncate text-xs text-muted"
                            title={`${property.code} / ${property.type}`}
                          >
                            {property.code} / {property.type}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-2">
                      <p
                        className="truncate text-[13px] font-medium"
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
                      <TableMoneyDisplay value={property.netIncome} />
                    </td>
                    <td className="px-1.5 py-2">
                      <TableOpenItems property={property} />
                    </td>
                    <td className="px-1.5 py-2">
                      <PropertyStatusBadges compact property={property} />
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
  onSelectProperty,
  property,
  selected,
}: {
  onSelectProperty: (id: string) => void;
  property: PropertySummary;
  selected: boolean;
}) {
  const attention = getPropertyCardAttention(property);

  return (
    <article
      className={cn(
        "group min-w-0 cursor-pointer overflow-hidden rounded-md border border-border bg-surface text-sm outline-none transition-colors hover:border-record-spine focus-visible:ring-2 focus-visible:ring-focus-ring",
        selected && "border-record-spine bg-state-selected",
        property.isArchived && "text-muted",
      )}
      data-selected={selected ? "true" : "false"}
      onClick={() => onSelectProperty(property.id)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectProperty(property.id);
        }
      }}
      tabIndex={0}
    >
      <PropertyThumbnail property={property} size="card" />

      <div className="grid min-w-0 gap-1 p-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p
            className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-muted"
            title={property.code}
          >
            {property.code}
          </p>
          <PropertyStatusBadges compact property={property} />
        </div>

        <div className="min-w-0">
          <Link
            className="block truncate rounded-sm text-sm font-semibold leading-5 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            href={`/properties/${property.id}`}
            onClick={(event) => event.stopPropagation()}
            prefetch={false}
            title={property.name}
          >
            {property.name}
          </Link>
          <p
            className="mt-0.5 truncate text-xs text-foreground-muted"
            title={property.type}
          >
            {property.type}
          </p>
        </div>

        {attention ? (
          <Badge className="w-fit px-1.5 py-0.5 text-[10px]" tone={attention.tone}>
            {attention.label}
          </Badge>
        ) : null}
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
          "flex h-7 w-full items-center gap-1 rounded px-1 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus-ring",
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
      ? "border px-1.5 py-0.5 text-[10px] font-semibold"
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
    "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted text-muted",
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
          <span className="text-sm font-semibold text-foreground-muted">
            {getPropertyInitials(property)}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide">
            Needs photo
          </span>
        </span>
      ) : null}
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
            "text-[13px] font-semibold tabular-nums",
            occupancyToneClass(occupancyRate),
          )}
        >
          {occupancyRate}%
        </span>
        <span className="text-xs text-muted tabular-nums">{openUnits} open</span>
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

function TableOpenItems({ property }: { property: PropertySummary }) {
  const openUnits = Math.max(0, property.units - property.occupiedUnits);
  const checks = [
    openUnits > 0 ? `${openUnits} open` : null,
    property.hasActiveOwnerLink ? null : "owner",
    property.netIncomeUsd < 0 ? "net" : null,
  ].filter(Boolean);

  if (checks.length === 0) {
    return <span className="text-xs text-success">Clear</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {checks.map((check) => (
        <Badge className="px-1.5 py-0.5 text-[11px]" key={check} tone="warning">
          {check}
        </Badge>
      ))}
    </div>
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
