import Link from "next/link";
import {
  Archive,
  Building2,
  ExternalLink,
  Home,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PropertySummary } from "@/features/properties/data/properties";

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
    return (
      <aside className="bg-surface p-4">
        <div className="flex items-center gap-2">
          <Building2 className="text-muted" size={16} />
          <h2 className="text-base font-semibold">Property inspector</h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Select a property row to inspect ownership, occupancy, and linked record
          context.
        </p>
      </aside>
    );
  }

  const action = getPropertySummaryAction(property);

  return (
    <aside className="bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
              {property.code}
            </p>
            <h2 className="mt-1 break-words text-base font-semibold">
              {property.name}
            </h2>
            <p className="mt-1 break-words text-sm text-muted">{property.type}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={property.statusTone}>{property.status}</Badge>
            {property.isArchived ? <Badge tone="warning">Archived</Badge> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-md border border-border bg-surface-muted/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                Next action
              </p>
              <p className="mt-1 break-words text-sm font-semibold">
                {action.label}
              </p>
            </div>
            <Badge tone={action.tone}>{action.badge}</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            {action.description}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Owner" value={property.owner} wide />
          <Detail icon={<Home size={14} />} label="Units" value={property.unitSummary} />
          <Detail label="Open units" value={String(getOpenUnitCount(property))} />
          <Detail label="Net income">
            <MoneyDisplay value={property.netIncome} />
          </Detail>
        </dl>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <Link
            aria-label={`Open ${property.name}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
            href={`/properties/${property.id}`}
            prefetch={false}
            title="Open property"
          >
            <ExternalLink size={15} />
            <span className="truncate">Open</span>
          </Link>
          {property.isArchived ? (
            <Button
              aria-label={`Restore ${property.name}`}
              className="px-2"
              onClick={() => onRestoreProperty(property)}
              title="Restore property"
              variant="primary"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <Button
              aria-label={`Edit ${property.name}`}
              className="px-2"
              onClick={() => onEditProperty(property)}
              title="Edit property"
            >
              <Pencil size={15} />
              Edit
            </Button>
          )}
          {!property.isArchived ? (
            <Button
              aria-label={`Archive ${property.name}`}
              className="px-2 text-danger hover:text-danger"
              onClick={() => onArchiveProperty(property)}
              title="Archive property"
              variant="ghost"
            >
              <Archive size={15} />
              Archive
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Link
            aria-label={`Open units for ${property.name}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={`/units?propertyId=${property.id}`}
            title="Open property units"
          >
            <Home size={15} />
            <span className="truncate">Units</span>
          </Link>
          <Link
            aria-label={`Open ledger for ${property.name}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={`/ledger?propertyId=${property.id}`}
            title="Open property ledger"
          >
            <Landmark size={15} />
            <span className="truncate">Ledger</span>
          </Link>
          <Link
            aria-label={`Open timeline for ${property.name}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={`/timeline?propertyId=${property.id}`}
            title="Open property timeline"
          >
            <ListTree size={15} />
            <span className="truncate">Timeline</span>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            aria-label={`Open leases for ${property.name}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={`/leases?propertyId=${property.id}`}
            title="Open property leases"
          >
            <ExternalLink size={15} />
            <span className="truncate">Leases</span>
          </Link>
          <Link
            aria-label={`Open maintenance for ${property.name}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={`/maintenance?propertyId=${property.id}`}
            title="Open property maintenance"
          >
            <Wrench size={15} />
            <span className="truncate">Maintenance</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}

function getOpenUnitCount(property: PropertySummary) {
  return Math.max(0, property.units - property.occupiedUnits);
}

function getPropertySummaryAction(property: PropertySummary) {
  const openUnitCount = getOpenUnitCount(property);

  if (!property.hasActiveOwnerLink) {
    return {
      badge: "Owner",
      description:
        "Link a current owner before owner reporting and follow-up are reliable.",
      label: "Assign current owner",
      tone: "danger" as const,
    };
  }

  if (property.units === 0) {
    return {
      badge: "Units",
      description: "Create units so leases, ledger rows, and evidence can drill down.",
      label: "Add the first unit",
      tone: "warning" as const,
    };
  }

  if (openUnitCount > 0) {
    return {
      badge: "Vacancy",
      description: `${openUnitCount} ${
        openUnitCount === 1 ? "unit is" : "units are"
      } open and should be reviewed against leases.`,
      label: "Review open units",
      tone: "warning" as const,
    };
  }

  if (property.netIncomeUsd < 0) {
    return {
      badge: "Net",
      description: "Active ledger totals are below zero for this property.",
      label: "Review ledger net",
      tone: "danger" as const,
    };
  }

  return {
    badge: "Clear",
    description: "Core owner, unit, occupancy, and net checks look aligned.",
    label: "Record looks connected",
    tone: "success" as const,
  };
}

function Detail({
  children,
  icon,
  label,
  value,
  wide = false,
}: {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={
        wide
          ? "col-span-2 min-w-0 rounded-md border border-border px-3 py-2.5"
          : "min-w-0 rounded-md border border-border px-3 py-2.5"
      }
    >
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {icon ? <span>{icon}</span> : null}
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}
