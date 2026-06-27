import Link from "next/link";
import {
  Archive,
  ExternalLink,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/features/properties/data/properties";
import type { PropertyDisplayMode } from "@/features/properties/property.types";
import type {
  CurrencyCode,
  MoneyDisplayValue,
} from "@/lib/money/format";
import { cn } from "@/lib/utils";

type PropertiesTableProps = {
  displayMode: PropertyDisplayMode;
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  onRestoreProperty: (property: PropertySummary) => void;
  onOpenProperty: (id: string) => void;
  onSelectProperty: (id: string) => void;
  properties: PropertySummary[];
  selectedPropertyId: string;
};

export function PropertiesTable({
  displayMode,
  onArchiveProperty,
  onEditProperty,
  onRestoreProperty,
  onOpenProperty,
  onSelectProperty,
  properties,
  selectedPropertyId,
}: PropertiesTableProps) {
  return (
    <div>
      <div
        className={cn(
          displayMode === "cards"
            ? "grid max-h-[380px] gap-3 overflow-auto pr-1 sm:grid-cols-2 lg:max-h-none lg:overflow-visible lg:pr-0 xl:grid-cols-3 2xl:grid-cols-2"
            : "max-h-[380px] space-y-3 overflow-auto pr-1 md:hidden",
        )}
      >
        {properties.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted sm:col-span-2 xl:col-span-3 2xl:col-span-2">
            No properties match the current filters.
          </p>
        ) : null}
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            onArchiveProperty={onArchiveProperty}
            onEditProperty={onEditProperty}
            onOpenProperty={onOpenProperty}
            onRestoreProperty={onRestoreProperty}
            onSelectProperty={onSelectProperty}
            property={property}
            selected={selectedPropertyId === property.id}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
          <div className="max-h-[min(620px,calc(100vh-320px))] overflow-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[6%]" />
                <col className="w-[25%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th className="px-2.5 py-2.5 font-semibold">Property</th>
                  <th className="px-1.5 py-2.5 text-center font-semibold">
                    Status
                  </th>
                  <th className="px-1.5 py-2.5 font-semibold">Owner</th>
                  <th className="px-1.5 py-2.5 font-semibold">Address</th>
                  <th className="px-1.5 py-2.5 text-right font-semibold">
                    Units
                  </th>
                  <th className="px-2 py-2.5 text-right font-semibold">Net</th>
                  <th className="px-1.5 py-2.5 text-center font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {properties.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-8 text-center text-muted" colSpan={7}>
                      No properties match the current filters.
                    </td>
                  </tr>
                ) : null}
                {properties.map((property) => (
                  <tr
                    className={cn(
                      "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      selectedPropertyId === property.id && "bg-surface-muted",
                      property.isArchived && "text-muted",
                    )}
                    key={property.id}
                    onClick={() => onSelectProperty(property.id)}
                    onDoubleClick={() => onOpenProperty(property.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectProperty(property.id);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-2.5 py-2">
                      <Link
                        className="block truncate font-medium text-accent hover:underline"
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
                    </td>
                    <td className="px-1.5 py-2">
                      <PropertyStatusBadges compact property={property} />
                    </td>
                    <td className="px-1.5 py-2">
                      <p
                        className="line-clamp-2 break-words leading-[18px]"
                        title={property.owner}
                      >
                        {property.owner}
                      </p>
                    </td>
                    <td className="px-1.5 py-2 text-foreground-muted">
                      <p
                        className="line-clamp-2 break-words leading-[18px]"
                        title={property.address}
                      >
                        {property.address}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-1.5 py-2 text-right font-medium tabular-nums">
                      {property.occupiedUnits}/{property.units}
                    </td>
                    <td className="px-2 py-2">
                      <TableMoneyDisplay value={property.netIncome} />
                    </td>
                    <td className="px-1.5 py-2">
                      <PropertyActions
                        onArchiveProperty={onArchiveProperty}
                        onEditProperty={onEditProperty}
                        onRestoreProperty={onRestoreProperty}
                        property={property}
                      />
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
  onArchiveProperty,
  onEditProperty,
  onOpenProperty,
  onRestoreProperty,
  onSelectProperty,
  property,
  selected,
}: {
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  onOpenProperty: (id: string) => void;
  onRestoreProperty: (property: PropertySummary) => void;
  onSelectProperty: (id: string) => void;
  property: PropertySummary;
  selected: boolean;
}) {
  return (
    <article
      className={cn(
        "group min-w-0 cursor-pointer rounded-md border border-border bg-surface px-3.5 py-3.5 text-sm transition-colors hover:border-[#c9d0da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        selected && "border-accent shadow-[0_0_0_1px_var(--accent)]",
        property.isArchived && "text-muted",
      )}
      onClick={() => onSelectProperty(property.id)}
      onDoubleClick={() => onOpenProperty(property.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectProperty(property.id);
        }
      }}
      tabIndex={0}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="block truncate text-base font-semibold leading-5 text-accent hover:underline"
            href={`/properties/${property.id}`}
            onClick={(event) => event.stopPropagation()}
            prefetch={false}
            title={property.name}
          >
            {property.name}
          </Link>
          <p
            className="mt-1 truncate font-medium"
            title={`${property.code} / ${property.type}`}
          >
            {property.code} / {property.type}
          </p>
          <p
            className="mt-0.5 line-clamp-1 break-words text-[13px] text-foreground-muted"
            title={property.address}
          >
            {property.address}
          </p>
        </div>
        <PropertyStatusBadges property={property} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-foreground-muted">
          {property.occupiedUnits}/{property.units} units
        </span>
        <TableMoneyDisplay showSecondary={false} value={property.netIncome} />
      </div>

      <div className="mt-3 flex justify-end border-t border-border pt-2">
        <PropertyActions
          className="justify-end gap-1"
          onArchiveProperty={onArchiveProperty}
          onEditProperty={onEditProperty}
          onRestoreProperty={onRestoreProperty}
          property={property}
          size="touch"
        />
      </div>
    </article>
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
    "border-2 px-2.5 py-1 text-xs font-semibold shadow-sm",
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

function PropertyActions({
  className,
  onArchiveProperty,
  onEditProperty,
  onRestoreProperty,
  size = "compact",
  property,
}: {
  className?: string;
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  onRestoreProperty: (property: PropertySummary) => void;
  size?: "compact" | "touch";
  property: PropertySummary;
}) {
  const wrapperClassName = cn("flex justify-center gap-1", className);
  const iconButtonClassName = cn(
    "inline-flex items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50",
    size === "touch" ? "h-9 w-9" : "h-[28px] w-[28px]",
  );

  return (
    <div
      className={wrapperClassName}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Link
        aria-label={`Open ${property.name}`}
        className={cn(iconButtonClassName, "hover:text-foreground")}
        href={`/properties/${property.id}`}
        onClick={(event) => event.stopPropagation()}
        prefetch={false}
        title="Open property"
      >
        <ExternalLink size={14} />
      </Link>
      {property.isArchived ? (
        <button
          aria-label={`Restore ${property.name}`}
          className={cn(iconButtonClassName, "hover:text-accent")}
          onClick={(event) => {
            event.stopPropagation();
            onRestoreProperty(property);
          }}
          title="Restore property"
          type="button"
        >
          <RotateCcw size={14} />
        </button>
      ) : (
        <>
          <button
            aria-label={`Edit ${property.name}`}
            className={cn(iconButtonClassName, "hover:text-foreground")}
            onClick={(event) => {
              event.stopPropagation();
              onEditProperty(property);
            }}
            title="Edit property"
            type="button"
          >
            <Pencil size={14} />
          </button>
          <button
            aria-label={`Archive ${property.name}`}
            className={cn(iconButtonClassName, "hover:text-danger")}
            onClick={(event) => {
              event.stopPropagation();
              onArchiveProperty(property);
            }}
            title="Archive property"
            type="button"
          >
            <Archive size={14} />
          </button>
        </>
      )}
    </div>
  );
}

function TableMoneyDisplay({
  showSecondary = true,
  value,
}: {
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
      className="flex min-w-0 items-center justify-end gap-1.5 whitespace-nowrap text-right text-sm leading-5 tabular-nums"
      title={showSecondary ? `${primary} / ${secondary}` : primary}
    >
      <span className="font-semibold text-foreground">{primary}</span>
      {showSecondary ? (
        <>
          <span className="text-muted">/</span>
          <span className="text-[13px] text-muted">{secondary}</span>
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
