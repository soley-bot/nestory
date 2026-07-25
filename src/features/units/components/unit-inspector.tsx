import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import {
  Archive,
  Building2,
  Ellipsis,
  ExternalLink,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UnitSummary } from "@/features/units/unit.types";
import { cn } from "@/lib/utils";

type UnitInspectorProps = {
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  unit: UnitSummary | null;
};

export function UnitInspector({
  onArchiveUnit,
  onEditUnit,
  onRestoreUnit,
  unit,
}: UnitInspectorProps) {
  if (!unit) {
    return null;
  }

  return (
    <div className="bg-surface">
      <div className="border-b border-border p-4 pr-14">
        <div className="flex min-w-0 items-start gap-3">
          <UnitPreviewPhoto unit={unit} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">
                  Unit {unit.unitNumber}
                </h2>
                <p className="mt-1 truncate text-sm text-foreground-muted">
                  {unit.propertyCode} · {unit.propertyName}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
                {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <section aria-labelledby="unit-preview-at-a-glance">
          <h3
            className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground-muted"
            id="unit-preview-at-a-glance"
          >
            At a glance
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Detail label="Property" value={unit.propertyName} wide />
            <Detail label="Rent">
              {unit.rentDisplay ? (
                <MoneyDisplay value={unit.rentDisplay} />
              ) : (
                unit.rentLabel
              )}
            </Detail>
            <Detail label="Ledger net">
              <MoneyDisplay value={unit.ledgerNetDisplay} />
            </Detail>
            <Detail label="Lease / tenant" value={unit.leaseLabel} wide />
          </dl>
        </section>

        {!unit.hasActiveLease ? (
          <section
            aria-labelledby="unit-preview-next-action"
            className="rounded-md border border-warning/30 bg-warning-soft/30 p-3"
          >
            <h3
              className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground-muted"
              id="unit-preview-next-action"
            >
              Next action
            </h3>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Add an active lease</p>
                <p className="mt-1 text-xs leading-5 text-foreground-muted">
                  This unit has no active lease linked.
                </p>
              </div>
              <Link
                aria-label={`Add lease for unit ${unit.unitNumber}`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning-soft px-2.5 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-warning-soft/70 focus-visible:ring-2 focus-visible:ring-focus-ring"
                href={getCreateLeaseHref(unit)}
              >
                <ScrollText size={14} />
                Add lease
              </Link>
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Link
            aria-label={`Open unit ${unit.unitNumber}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-brand-solid bg-brand-solid px-3 text-sm font-semibold text-brand-on-solid outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus-ring"
            href={`/units/${unit.id}`}
            prefetch={false}
          >
            <ExternalLink size={15} />
            Open unit
          </Link>
          {unit.isArchived ? (
            <Button
              aria-label={`Restore unit ${unit.unitNumber}`}
              className="h-9"
              onClick={() => onRestoreUnit(unit)}
              variant="primary"
            >
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <Button
              aria-label={`Edit unit ${unit.unitNumber}`}
              className="h-9"
              onClick={() => onEditUnit(unit)}
            >
              <Pencil size={15} />
              Edit unit
            </Button>
          )}
        </div>

        <section aria-labelledby="unit-preview-related-records">
          <h3
            className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground-muted"
            id="unit-preview-related-records"
          >
            Related records
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PreviewLink
              href={`/timeline?unitId=${unit.id}`}
              icon={<ListTree size={15} />}
              label="Timeline"
              meta="Recent history"
            />
            <PreviewLink
              href={`/ledger?propertyId=${unit.propertyId}&query=${encodeURIComponent(
                unit.unitNumber,
              )}`}
              icon={<Landmark size={15} />}
              label="Ledger"
              meta="Financial activity"
            />
          </div>
        </section>

        <div className="border-t border-border pt-3">
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                aria-label={`More actions for unit ${unit.unitNumber}`}
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
                {unit.isArchived ? (
                  <PreviewMenuButton
                    ariaLabel={`Edit unit ${unit.unitNumber}`}
                    icon={<Pencil size={14} />}
                    label="Edit unit"
                    onClick={() => onEditUnit(unit)}
                  />
                ) : (
                  <PreviewMenuButton
                    ariaLabel={`Archive unit ${unit.unitNumber}`}
                    danger
                    icon={<Archive size={14} />}
                    label="Archive unit"
                    onClick={() => onArchiveUnit(unit)}
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

function UnitPreviewPhoto({ unit }: { unit: UnitSummary }) {
  const className =
    "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted text-foreground-muted";

  if (unit.thumbnailUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn(className, "bg-cover bg-center")}
        style={{ backgroundImage: `url(${unit.thumbnailUrl})` }}
      />
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      <Building2 size={22} />
    </span>
  );
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
  meta: string;
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
        <span className="block truncate text-xs text-foreground-muted">{meta}</span>
      </span>
    </Link>
  );
}

function PreviewMenuButton({
  ariaLabel,
  danger = false,
  icon,
  label,
  onClick,
}: {
  ariaLabel: string;
  danger?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Popover.Close asChild>
      <button
        aria-label={ariaLabel}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
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

function getCreateLeaseHref(unit: UnitSummary) {
  const params = new URLSearchParams({
    action: "create",
    propertyId: unit.propertyId,
    unitId: unit.id,
  });

  return `/leases?${params.toString()}`;
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
