import Link from "next/link";
import {
  Archive,
  Building2,
  ExternalLink,
  ImageIcon,
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
            ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2"
            : "space-y-3 md:hidden",
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
            onOpenProperty={onOpenProperty}
            onSelectProperty={onSelectProperty}
            property={property}
            selected={selectedPropertyId === property.id}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2 text-xs text-muted">
            <span>Single-click a row to preview it in the inspector.</span>
            <span className="font-medium text-foreground">
              Use Open to view the full record.
            </span>
          </div>
          <div className="max-h-[min(680px,calc(100vh-300px))] overflow-auto">
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
                      selectedPropertyId === property.id && "bg-accent-soft",
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
                    <td className="px-1.5 py-2 text-muted">
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
  onOpenProperty,
  onSelectProperty,
  property,
  selected,
}: {
  onOpenProperty: (id: string) => void;
  onSelectProperty: (id: string) => void;
  property: PropertySummary;
  selected: boolean;
}) {
  return (
    <article
      className={cn(
        "group min-w-0 cursor-pointer overflow-hidden rounded-md border border-border bg-surface text-sm transition-colors hover:border-[#c9d0da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
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
      <div className="relative aspect-[16/9] overflow-hidden bg-[#eef0f4]">
        <div className={cn("absolute inset-0", getPropertyPhotoTone(property.type))} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,11,18,0.08),rgba(8,11,18,0.34))]" />
        <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-md bg-white/82 text-[#363c47] shadow-sm backdrop-blur">
          <ImageIcon size={17} />
        </div>
        <div className="absolute right-3 top-3">
          <PropertyStatusBadges property={property} />
        </div>
        <div className="absolute bottom-3 left-3 right-3 min-w-0 text-white">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-white/75">
            {property.code}
          </p>
          <Link
            className="mt-1 block truncate text-base font-semibold leading-5 text-white hover:underline"
            href={`/properties/${property.id}`}
            onClick={(event) => event.stopPropagation()}
            prefetch={false}
            title={property.name}
          >
            {property.name}
          </Link>
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-medium"
            title={`${property.type} property`}
          >
            {property.type}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted">
          <Building2 size={13} />
          <span className="whitespace-nowrap tabular-nums">
            {property.occupiedUnits}/{property.units} units
          </span>
        </div>
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
  property,
}: {
  className?: string;
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  onRestoreProperty: (property: PropertySummary) => void;
  property: PropertySummary;
}) {
  const wrapperClassName = cn("flex justify-center gap-1", className);
  const buttonClassName =
    "inline-flex h-[28px] items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50";
  const iconButtonClassName = cn(buttonClassName, "w-[28px]");

  return (
    <div
      className={wrapperClassName}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Link
        aria-label={`Open ${property.name}`}
        className="inline-flex h-[28px] items-center gap-1 rounded-md border border-border bg-white px-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-accent hover:text-accent"
        href={`/properties/${property.id}`}
        onClick={(event) => event.stopPropagation()}
        prefetch={false}
        title="Open property"
      >
        <ExternalLink size={13} />
        Open
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

function TableMoneyDisplay({ value }: { value: MoneyDisplayValue }) {
  const primary = formatMoneyWithSymbol(value.primary, value.primaryCurrency);
  const secondary = formatMoneyWithSymbol(
    value.secondary,
    value.secondaryCurrency,
  );

  return (
    <span
      className="flex min-w-0 items-center justify-end gap-1.5 whitespace-nowrap text-right text-sm leading-5 tabular-nums"
      title={`${primary} / ${secondary}`}
    >
      <span className="font-semibold text-foreground">{primary}</span>
      <span className="text-muted">/</span>
      <span className="text-[13px] text-muted">{secondary}</span>
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

function getPropertyPhotoTone(type: string) {
  const normalizedType = type.toLowerCase();

  if (normalizedType.includes("retail") || normalizedType.includes("mixed")) {
    return "bg-[linear-gradient(135deg,#d8c1a3_0%,#eef0f4_48%,#9aa5b5_100%)]";
  }

  if (
    normalizedType.includes("townhouse") ||
    normalizedType.includes("condominium")
  ) {
    return "bg-[linear-gradient(135deg,#b9c2bf_0%,#edf0ec_46%,#a38d73_100%)]";
  }

  return "bg-[linear-gradient(135deg,#c6d0d9_0%,#f3f1ec_48%,#9c8b77_100%)]";
}
