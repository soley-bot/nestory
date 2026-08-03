import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import {
  Archive,
  Ellipsis,
  ExternalLink,
  Home,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
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
  const openUnitCount = getOpenUnitCount(property);
  const occupancyRate =
    property.units > 0
      ? Math.round((property.occupiedUnits / property.units) * 100)
      : 0;

  return (
    <div className="bg-surface">
      <div className="border-b border-border p-4 pr-14">
        <div className="flex min-w-0 items-start gap-3">
          <PropertyPreviewPhoto property={property} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold" title={property.name}>
                  {property.name}
                </h2>
                <p className="mt-1 truncate text-sm text-foreground-muted">
                  {property.code} · {property.type}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={property.statusTone}>{property.status}</Badge>
                {property.isArchived ? <Badge tone="warning">Archived</Badge> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <section aria-labelledby="property-preview-at-a-glance">
          <h3
            className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground-muted"
            id="property-preview-at-a-glance"
          >
            At a glance
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Detail label="Owner" value={property.owner} wide />
            <Detail label="Address" value={property.address} wide />
            <Detail label="Units" value={String(property.units)} />
            <Detail
              label="Occupancy"
              value={`${property.occupiedUnits}/${property.units} · ${occupancyRate}%`}
            />
            <Detail label="Net income" wide>
              <MoneyDisplay value={property.netIncome} />
            </Detail>
          </dl>
        </section>

        <section
          aria-labelledby="property-preview-next-action"
          className="rounded-md border border-border bg-surface-muted/60 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground-muted"
                id="property-preview-next-action"
              >
                Next action
              </h3>
              <p className="mt-1 break-words text-sm font-semibold">{action.label}</p>
            </div>
            <Badge tone={action.tone}>{action.badge}</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-foreground-muted">
            {action.description}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Link
            aria-label={`Open ${property.name}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-brand-solid bg-brand-solid px-3 text-sm font-semibold text-brand-on-solid outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus-ring"
            href={`/properties/${property.id}`}
            prefetch={false}
          >
            <ExternalLink size={15} />
            Open property
          </Link>
          {property.isArchived ? (
            <Button
              aria-label={`Restore ${property.name}`}
              className="h-9"
              onClick={() => onRestoreProperty(property)}
              variant="primary"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <Button
              aria-label={`Edit ${property.name}`}
              className="h-9"
              onClick={() => onEditProperty(property)}
            >
              <Pencil size={15} />
              Edit property
            </Button>
          )}
        </div>

        <section aria-labelledby="property-preview-related-records">
          <h3
            className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground-muted"
            id="property-preview-related-records"
          >
            Related records
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PreviewLink
              href={`/units?propertyId=${property.id}`}
              icon={<Home size={15} />}
              label="Units"
              meta={`${property.units} total`}
            />
            <PreviewLink
              href={`/leases?propertyId=${property.id}`}
              icon={<ScrollText size={15} />}
              label="Leases"
              meta={`${property.occupiedUnits} occupied · ${openUnitCount} open`}
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
        </section>

        <div className="border-t border-border pt-3">
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                aria-label={`More actions for ${property.name}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                type="button"
              >
                <Ellipsis size={16} />
                More actions
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                className="z-[110] w-44 rounded-md border border-border bg-surface p-1.5 text-sm shadow-lg"
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
        </div>
      </div>
    </div>
  );
}

function PropertyPreviewPhoto({ property }: { property: PropertySummary }) {
  const className =
    "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted text-sm font-semibold text-foreground-muted";

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
  meta,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  meta?: string;
}) {
  return (
    <Link
      className="flex min-w-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
      href={href}
    >
      <span className="text-foreground-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">
          {label}
        </span>
        {meta ? (
          <span className="block truncate text-xs text-foreground-muted">{meta}</span>
        ) : null}
      </span>
    </Link>
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
          "flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
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
  label,
  value,
  wide = false,
}: {
  children?: React.ReactNode;
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border border-border px-3 py-2.5",
        wide && "col-span-2",
      )}
    >
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{children ?? value}</dd>
    </div>
  );
}
