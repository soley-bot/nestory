import * as Popover from "@radix-ui/react-popover";
import {
  Archive,
  Building2,
  Ellipsis,
  ImagePlus,
  Pencil,
  RotateCcw,
} from "lucide-react";
import {
  previewRowClassName,
  RecordLink,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";
import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/features/properties/data/properties";
import type { PropertyDisplayMode } from "@/features/properties/property.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
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
                <col className="w-[34%]" />
                <col className="w-[27%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[7%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th className="px-2.5 py-2.5 font-semibold">Property</th>
                  <th className="px-1.5 py-2.5 font-semibold">Occupancy</th>
                  <th className="px-1.5 py-2.5 text-right font-semibold">
                    Net
                  </th>
                  <th className="px-1.5 py-2.5 text-center font-semibold">
                    Status
                  </th>
                  <th className="px-2 py-2.5 text-center font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {properties.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-8 text-center text-muted" colSpan={5}>
                      No properties match the current filters.
                    </td>
                  </tr>
                ) : null}
                {properties.map((property) => (
                  <tr
                    className={cn(
                      previewRowClassName,
                      selectedPropertyId === property.id &&
                        selectedPreviewRowClassName,
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
                      <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5">
                        <PropertyThumbnail property={property} />
                        <div className="min-w-0">
                          <RecordLink
                            href={`/properties/${property.id}`}
                            title={`Open full property record: ${property.name}`}
                          >
                            {property.name}
                          </RecordLink>
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
                      <TableOccupancy property={property} />
                    </td>
                    <td className="px-1.5 py-2">
                      <TableMoneyDisplay value={property.netIncome} />
                    </td>
                    <td className="px-1.5 py-2">
                      <PropertyStatusBadges compact property={property} />
                    </td>
                    <td className="px-2 py-2">
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
        <div className="grid min-w-0 grid-cols-[52px_minmax(0,1fr)] gap-3">
          <PropertyThumbnail property={property} size="large" />
          <div className="min-w-0">
            <RecordLink
              className="text-base font-semibold leading-5"
              href={`/properties/${property.id}`}
              title={`Open full property record: ${property.name}`}
            >
              {property.name}
            </RecordLink>
            <p
              className="mt-1 truncate font-medium"
              title={`${property.code} / ${property.type}`}
            >
              {property.code} / {property.type}
            </p>
          </div>
        </div>
        <PropertyStatusBadges property={property} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-foreground-muted">
          {property.occupiedUnits}/{property.units} units
        </span>
        <TableMoneyDisplay value={property.netIncome} />
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
  const triggerClassName = cn(
    "inline-flex items-center justify-center rounded-md border border-transparent text-muted transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground data-[state=open]:border-border data-[state=open]:bg-surface-muted data-[state=open]:text-foreground",
    size === "touch" ? "h-9 w-9" : "h-8 w-8",
  );

  return (
    <div
      className={wrapperClassName}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            aria-label={`Open actions for ${property.name}`}
            className={triggerClassName}
            onClick={(event) => event.stopPropagation()}
            title="Actions"
            type="button"
          >
            <Ellipsis size={16} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            className="z-50 w-44 rounded-md border border-border bg-surface p-1.5 text-sm shadow-lg"
            onClick={(event) => event.stopPropagation()}
            side="bottom"
            sideOffset={6}
          >
            {property.isArchived ? (
              <PropertyActionMenuButton
                icon={<RotateCcw size={14} />}
                label="Restore"
                onClick={() => onRestoreProperty(property)}
              />
            ) : (
              <>
                <PropertyActionMenuButton
                  icon={<ImagePlus size={14} />}
                  label={property.thumbnailUrl ? "Add photo" : "Upload photo"}
                  onClick={() => onEditProperty(property)}
                />
                <PropertyActionMenuButton
                  icon={<Pencil size={14} />}
                  label="Edit"
                  onClick={() => onEditProperty(property)}
                />
                <PropertyActionMenuButton
                  danger
                  icon={<Archive size={14} />}
                  label="Archive"
                  onClick={() => onArchiveProperty(property)}
                />
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function PropertyActionMenuButton({
  danger = false,
  icon,
  label,
  onClick,
}: {
  danger?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Popover.Close asChild>
      <button
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted",
          danger && "text-danger hover:text-danger",
        )}
        onClick={onClick}
        type="button"
      >
        {icon}
        <span>{label}</span>
      </button>
    </Popover.Close>
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
  size?: "large" | "small";
}) {
  const className = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted text-muted",
    size === "large" ? "size-[52px]" : "size-10",
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
    <span className={className} aria-hidden="true">
      <Building2 size={size === "large" ? 19 : 16} />
    </span>
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

function formatMoneyWithSymbol(label: string) {
  const isNegative = label.startsWith("-");
  const unsignedLabel = isNegative ? label.slice(1) : label;
  const codePrefix = "USD ";
  const amount = unsignedLabel.startsWith(codePrefix)
    ? unsignedLabel.slice(codePrefix.length)
    : unsignedLabel;

  return `${isNegative ? "-" : ""}$${amount}`;
}
