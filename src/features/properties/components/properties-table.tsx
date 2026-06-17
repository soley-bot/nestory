import Link from "next/link";
import { Archive, ExternalLink, Pencil, RotateCcw } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/features/properties/data/properties";
import { cn } from "@/lib/utils";

type PropertiesTableProps = {
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  onRestoreProperty: (property: PropertySummary) => void;
  onSelectProperty: (id: string) => void;
  properties: PropertySummary[];
  selectedPropertyId: string;
};

export function PropertiesTable({
  onArchiveProperty,
  onEditProperty,
  onRestoreProperty,
  onSelectProperty,
  properties,
  selectedPropertyId,
}: PropertiesTableProps) {
  return (
    <div>
      <div className="space-y-3 md:hidden">
        {properties.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            No properties match the current filters.
          </p>
        ) : null}
        {properties.map((property) => (
          <article
            className={cn(
              "cursor-pointer rounded-md border border-border bg-surface p-4 text-sm transition-colors hover:bg-surface-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              selectedPropertyId === property.id && "border-accent bg-accent-soft",
              property.isArchived && "text-muted",
            )}
            key={property.id}
            onClick={() => onSelectProperty(property.id)}
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
                  className="break-words font-medium text-accent hover:underline"
                  href={`/properties/${property.id}`}
                  onClick={(event) => event.stopPropagation()}
                  prefetch={false}
                >
                  {property.name}
                </Link>
                <p className="mt-1 break-words text-xs text-muted">
                  {property.code} / {property.type}
                </p>
              </div>
              <PropertyStatusBadges property={property} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <CardDetail label="Owner" value={property.owner} />
              <CardDetail
                align="right"
                label="Occupancy"
                value={property.unitSummary}
              />
              <CardDetail label="Address" value={property.address} />
              <CardDetail align="right" label="Net income">
                <MoneyDisplay align="right" value={property.netIncome} />
              </CardDetail>
            </dl>
            <PropertyActions
              className="mt-4"
              onArchiveProperty={onArchiveProperty}
              onEditProperty={onEditProperty}
              onRestoreProperty={onRestoreProperty}
              property={property}
            />
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
        <div className="max-h-[min(680px,calc(100vh-260px))] overflow-auto">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[218px]" />
              <col className="w-[132px]" />
              <col className="w-[152px]" />
              <col />
              <col className="w-[116px]" />
              <col className="w-[150px]" />
              <col className="w-[86px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted shadow-[0_1px_0_var(--border)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Property</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Owner</th>
                <th className="px-3 py-3 font-semibold">Address</th>
                <th className="px-3 py-3 text-right font-semibold">Units</th>
                <th className="px-3 py-3 text-right font-semibold">Net</th>
                <th className="px-2 py-3 text-right font-semibold">Actions</th>
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectProperty(property.id);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-4 py-2.5">
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
                      className="mt-1 truncate text-xs text-muted"
                      title={`${property.code} / ${property.type}`}
                    >
                      {property.code} / {property.type}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <PropertyStatusBadges property={property} />
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="line-clamp-2 break-words" title={property.owner}>
                      {property.owner}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    <p
                      className="line-clamp-2 break-words"
                      title={property.address}
                    >
                      {property.address}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {property.occupiedUnits}/{property.units}
                  </td>
                  <td className="px-3 py-2.5">
                    <MoneyDisplay align="right" value={property.netIncome} />
                  </td>
                  <td className="px-2 py-2.5">
                    <PropertyActions
                      compact
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
    </div>
  );
}

function PropertyStatusBadges({ property }: { property: PropertySummary }) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5">
      <Badge tone={property.statusTone}>{property.status}</Badge>
      {property.isArchived ? <Badge tone="warning">Archived</Badge> : null}
    </div>
  );
}

function PropertyActions({
  className,
  compact = false,
  onArchiveProperty,
  onEditProperty,
  onRestoreProperty,
  property,
}: {
  className?: string;
  compact?: boolean;
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  onRestoreProperty: (property: PropertySummary) => void;
  property: PropertySummary;
}) {
  const wrapperClassName = cn("flex justify-end gap-1", className);
  const buttonClassName =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50";

  return (
    <div className={wrapperClassName}>
      <Link
        aria-label={`Open ${property.name}`}
        className={cn(buttonClassName, "hover:text-foreground")}
        href={`/properties/${property.id}`}
        onClick={(event) => event.stopPropagation()}
        prefetch={false}
      >
        <ExternalLink size={15} />
      </Link>
      {property.isArchived ? (
        <button
          aria-label={`Restore ${property.name}`}
          className={cn(buttonClassName, "hover:text-accent")}
          onClick={(event) => {
            event.stopPropagation();
            onRestoreProperty(property);
          }}
          type="button"
        >
          <RotateCcw size={15} />
        </button>
      ) : (
        <>
          <button
            aria-label={`Edit ${property.name}`}
            className={cn(buttonClassName, "hover:text-foreground")}
            onClick={(event) => {
              event.stopPropagation();
              onEditProperty(property);
            }}
            type="button"
          >
            <Pencil size={15} />
          </button>
          <button
            aria-label={`Archive ${property.name}`}
            className={cn(buttonClassName, "hover:text-danger")}
            onClick={(event) => {
              event.stopPropagation();
              onArchiveProperty(property);
            }}
            title={
              compact && property.units > 0
                ? "Archive units before archiving this property."
                : undefined
            }
            type="button"
          >
            <Archive size={15} />
          </button>
        </>
      )}
    </div>
  );
}

function CardDetail({
  align = "left",
  children,
  label,
  value,
}: {
  align?: "left" | "right";
  children?: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0"}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}
