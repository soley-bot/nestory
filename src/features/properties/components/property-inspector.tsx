import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Ellipsis,
  Home,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Button } from "@/components/ui/button";
import type { PropertySummary } from "@/features/properties/data/properties";
import { cn } from "@/lib/utils";

type PropertyInspectorProps = {
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  onRestoreProperty: (property: PropertySummary) => void;
  property: PropertySummary | null;
};

export function PropertyInspector({
  onArchiveProperty,
  onEditProperty,
  onRestoreProperty,
  property,
}: PropertyInspectorProps) {
  if (!property) {
    return null;
  }

  const action = getPropertySummaryAction(property);
  const occupancyRate =
    property.units > 0
      ? Math.round((property.occupiedUnits / property.units) * 100)
      : 0;

  return (
    <div className="flex min-h-full flex-col bg-card">
      <header className="border-b border-border p-5 pr-14">
        <div className="flex min-w-0 items-center gap-3">
          <PropertyPreviewPhoto property={property} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold" title={property.name}>
                  {property.name}
                </h2>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {property.code} · {property.type}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                  property.statusTone === "success" &&
                    "border-success/30 bg-success-soft text-success",
                  property.statusTone === "warning" &&
                    "border-warning/30 bg-warning-soft text-warning",
                  property.statusTone === "neutral" &&
                    "border-border bg-muted text-muted-foreground",
                )}
              >
                {property.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <Link
        aria-label={action.label}
        className={cn(
          "flex min-w-0 items-center gap-2 border-b px-4 py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          action.tone === "warning" &&
            "border-warning/30 bg-warning-soft/45 text-warning hover:bg-warning-soft/65",
          action.tone === "danger" &&
            "border-danger/30 bg-danger-soft/45 text-danger hover:bg-danger-soft/65",
          action.tone === "success" &&
            "border-success/30 bg-success-soft/45 text-success hover:bg-success-soft/65",
        )}
        href={action.href}
      >
        {action.tone === "success" ? (
          <CheckCircle2 className="shrink-0" size={16} />
        ) : (
          <AlertTriangle className="shrink-0" size={16} />
        )}
        <span className="min-w-0 flex-1 truncate">{action.label}</span>
        <ArrowRight className="shrink-0" size={16} />
      </Link>

      <div className="space-y-5 p-5">
        <dl
          aria-label="Property summary"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          role="group"
        >
          <div
            className="min-w-0 rounded-xl bg-muted/55 p-4"
            data-slot="property-preview-fact-card"
          >
            <dt className="text-sm font-medium text-muted-foreground">Occupancy</dt>
            <dd className="mt-1 flex items-baseline gap-0.5 tabular-nums">
              <span className="text-2xl font-semibold tracking-tight">
                {property.occupiedUnits}
              </span>
              <span className="text-base font-medium text-muted-foreground">
                /{property.units}
              </span>
            </dd>
            <div
              aria-label={`Occupancy ${property.occupiedUnits} of ${property.units} units`}
              aria-valuemax={property.units}
              aria-valuemin={0}
              aria-valuenow={property.occupiedUnits}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
              role="progressbar"
            >
              <span
                className="block h-full rounded-full bg-foreground/65"
                style={{ width: `${occupancyRate}%` }}
              />
            </div>
          </div>
          <div
            className="min-w-0 rounded-xl bg-muted/55 p-4"
            data-slot="property-preview-fact-card"
          >
            <dt className="text-sm font-medium text-muted-foreground">Net income</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              <MoneyDisplay value={property.netIncome} />
            </dd>
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                property.netIncomeUsd >= 0 ? "text-success" : "text-danger",
              )}
            >
              {property.netIncomeUsd >= 0 ? "Positive this period" : "Negative this period"}
            </p>
          </div>
          <div
            className="min-w-0 rounded-xl bg-muted/55 p-4"
            data-slot="property-preview-fact-card"
          >
            <dt className="text-sm font-medium text-muted-foreground">Units</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {property.units}
            </dd>
            <p className="mt-1 text-xs text-muted-foreground">
              {property.occupiedUnits} {property.occupiedUnits === 1 ? "lease" : "leases"} active
            </p>
          </div>
        </dl>

        <dl
          aria-label="Property details"
          className="grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-2 sm:gap-8"
          role="group"
        >
          <Detail label="Owner" value={property.owner} />
          <Detail label="Address" value={property.address} />
        </dl>

        <nav aria-label="Property records">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Jump to</p>
          <div className="flex flex-wrap gap-2">
          <PreviewLink
            href={`/units?propertyId=${property.id}`}
            icon={<Home size={15} />}
            label="Units"
            value={String(property.units)}
          />
          <PreviewLink
            href={`/leases?propertyId=${property.id}`}
            icon={<ScrollText size={15} />}
            label="Leases"
            value={String(property.occupiedUnits)}
          />
          <PreviewLink
            href={`/ledger?propertyId=${property.id}`}
            icon={<Landmark size={15} />}
            label="Ledger"
          />
          <PreviewLink
            href={`/timeline?propertyId=${property.id}`}
            icon={<ListTree size={15} />}
            label="Timeline"
          />
          </div>
        </nav>
      </div>

      <div
        aria-label="Property actions"
        className="sticky bottom-0 mt-auto flex items-center gap-2 border-t border-border bg-card p-4"
        role="group"
      >
        <PropertyMoreMenu
          onArchiveProperty={onArchiveProperty}
          onEditProperty={onEditProperty}
          property={property}
        />
        <span className="flex-1" />
        {property.isArchived ? (
          <Button
            aria-label={`Restore ${property.name}`}
            className="h-10"
            onClick={() => onRestoreProperty(property)}
            variant="outline"
          >
            <RotateCcw size={15} />
            Restore
          </Button>
        ) : (
          <Button
            aria-label={`Edit ${property.name}`}
            className="h-10"
            onClick={() => onEditProperty(property)}
            variant="outline"
          >
            <Pencil size={15} />
            Edit
          </Button>
        )}
        <Link
          aria-label={`Open ${property.name}`}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
          href={`/properties/${property.id}`}
          prefetch={false}
        >
          Open property
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

function PropertyPreviewPhoto({ property }: { property: PropertySummary }) {
  const className =
    "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/20 bg-primary/10 text-sm font-semibold text-primary";

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
    <span aria-hidden="true" className={className}>
      {getPropertyInitials(property)}
    </span>
  );
}

function getPropertyInitials(property: PropertySummary) {
  const source = property.code.trim() || property.name;

  return source
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function PreviewLink({
  href,
  icon,
  label,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <Link
      aria-label={value ? `${label} ${value}` : label}
      className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      data-slot="property-preview-record-pill"
      href={href}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 truncate text-foreground">
        {label}
      </span>
      {value ? (
        <span className="tabular-nums text-muted-foreground">{value}</span>
      ) : null}
    </Link>
  );
}

function PropertyMoreMenu({
  onArchiveProperty,
  onEditProperty,
  property,
}: {
  onArchiveProperty: (property: PropertySummary) => void;
  onEditProperty: (property: PropertySummary) => void;
  property: PropertySummary;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={`More actions for ${property.name}`}
          className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <Ellipsis size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-[110] w-44 rounded-md border border-border bg-card p-1.5 text-sm shadow-lg"
          side="top"
          sideOffset={6}
        >
          {property.isArchived ? (
            <PreviewMenuButton
              icon={<Pencil size={14} />}
              label="Edit property"
              onClick={() => onEditProperty(property)}
            />
          ) : (
            <PreviewMenuButton
              danger
              icon={<Archive size={14} />}
              label="Archive property"
              onClick={() => onArchiveProperty(property)}
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PreviewMenuButton({
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
          "flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          danger && "text-danger hover:text-danger",
        )}
        onClick={onClick}
        type="button"
      >
        {icon}
        {label}
      </button>
    </Popover.Close>
  );
}

function getOpenUnitCount(property: PropertySummary) {
  return Math.max(0, property.units - property.occupiedUnits);
}

function getPropertySummaryAction(property: PropertySummary) {
  const openUnitCount = getOpenUnitCount(property);

  if (!property.hasActiveOwnerLink) {
    return {
      href: `/properties/${property.id}`,
      label: "Assign an owner",
      tone: "danger" as const,
    };
  }

  if (property.units === 0) {
    return {
      href: `/units?action=create&propertyId=${property.id}`,
      label: "Add first unit",
      tone: "warning" as const,
    };
  }

  if (openUnitCount > 0) {
    return {
      href: `/units?propertyId=${property.id}&leaseStatus=missing`,
      label: `${openUnitCount} vacant ${
        openUnitCount === 1 ? "unit" : "units"
      } — review against leases`,
      tone: "warning" as const,
    };
  }

  if (property.netIncomeUsd < 0) {
    return {
      href: `/ledger?propertyId=${property.id}`,
      label: "Review ledger net",
      tone: "danger" as const,
    };
  }

  return {
    href: `/properties/${property.id}`,
    label: "Property records connected",
    tone: "success" as const,
  };
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-base font-semibold">{value}</dd>
    </div>
  );
}
