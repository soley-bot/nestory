import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  CheckCircle2,
  Ellipsis,
  Landmark,
  ListTree,
  Pencil,
  RotateCcw,
  ScrollText,
  Wrench,
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

  const action = getUnitSummaryAction(unit);

  return (
    <div className="flex min-h-full flex-col bg-card">
      <header className="border-b border-border p-5 pr-14">
        <div className="flex min-w-0 items-center gap-3">
          <UnitPreviewPhoto unit={unit} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  Unit {unit.unitNumber}
                </h2>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {unit.propertyCode} · {unit.propertyName}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={unit.occupancyTone}>{unit.occupancyLabel}</Badge>
                {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
              </div>
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
          aria-label="Unit summary"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          role="group"
        >
          <FactCard label="Rent">
            {unit.rentDisplay ? (
              <MoneyDisplay size="large" value={unit.rentDisplay} />
            ) : (
              <span className="text-lg font-semibold">{unit.rentLabel}</span>
            )}
          </FactCard>
          <FactCard label="Ledger net">
            <MoneyDisplay size="large" value={unit.ledgerNetDisplay} />
          </FactCard>
          <FactCard label="Lease">
            <span className="line-clamp-2 text-base font-semibold">
              {unit.hasActiveLease ? unit.leaseLabel : "No active lease"}
            </span>
          </FactCard>
        </dl>

        <dl
          aria-label="Unit details"
          className="grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-2 sm:gap-8"
          role="group"
        >
          <Detail label="Property" value={unit.propertyName} />
          <Detail label="Floor" value={unit.floorLabel} />
        </dl>

        <nav aria-label="Unit records">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Jump to</p>
          <div className="flex flex-wrap gap-2">
            <PreviewLink
              href={`/leases?unitId=${unit.id}`}
              icon={<ScrollText size={15} />}
              label="Lease"
            />
            <PreviewLink
              href={`/ledger?propertyId=${unit.propertyId}&unitId=${unit.id}`}
              icon={<Landmark size={15} />}
              label="Ledger"
            />
            <PreviewLink
              href={`/maintenance?unitId=${unit.id}`}
              icon={<Wrench size={15} />}
              label="Maintenance"
            />
            <PreviewLink
              href={`/timeline?unitId=${unit.id}`}
              icon={<ListTree size={15} />}
              label="Timeline"
            />
          </div>
        </nav>
      </div>

      <div
        aria-label="Unit actions"
        className="sticky bottom-0 mt-auto flex items-center gap-2 border-t border-border bg-card p-4"
        role="group"
      >
        <UnitMoreMenu
          onArchiveUnit={onArchiveUnit}
          onEditUnit={onEditUnit}
          unit={unit}
        />
        <span className="flex-1" />
        {unit.isArchived ? (
          <Button
            aria-label={`Restore unit ${unit.unitNumber}`}
            className="h-10"
            onClick={() => onRestoreUnit(unit)}
            variant="outline"
          >
            <RotateCcw size={15} />
            Restore
          </Button>
        ) : (
          <Button
            aria-label={`Edit unit ${unit.unitNumber}`}
            className="h-10"
            onClick={() => onEditUnit(unit)}
            variant="outline"
          >
            <Pencil size={15} />
            Edit
          </Button>
        )}
        <Link
          aria-label={`Open unit ${unit.unitNumber}`}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
          href={`/units/${unit.id}`}
          prefetch={false}
        >
          Open unit
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

function UnitPreviewPhoto({ unit }: { unit: UnitSummary }) {
  const className =
    "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/20 bg-primary/10 text-sm font-semibold text-primary";

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
      <Building2 size={20} />
    </span>
  );
}

function FactCard({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      className="min-w-0 rounded-xl bg-muted/55 p-4"
      data-slot="unit-preview-fact-card"
    >
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0">{children}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function PreviewLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate text-foreground">{label}</span>
    </Link>
  );
}

function UnitMoreMenu({
  onArchiveUnit,
  onEditUnit,
  unit,
}: {
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  unit: UnitSummary;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={`More actions for unit ${unit.unitNumber}`}
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

function getUnitSummaryAction(unit: UnitSummary) {
  if (!unit.hasActiveLease) {
    return {
      href: getCreateLeaseHref(unit),
      label: "Add an active lease",
      tone: "warning" as const,
    };
  }

  if (unit.ledgerNetUsd < 0) {
    return {
      href: `/ledger?propertyId=${unit.propertyId}&unitId=${unit.id}`,
      label: "Review negative ledger balance",
      tone: "danger" as const,
    };
  }

  return {
    href: `/units/${unit.id}`,
    label: "Unit records connected",
    tone: "success" as const,
  };
}

function getCreateLeaseHref(unit: UnitSummary) {
  const params = new URLSearchParams({
    action: "create",
    propertyId: unit.propertyId,
    unitId: unit.id,
  });

  return `/leases?${params.toString()}`;
}
