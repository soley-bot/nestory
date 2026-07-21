"use client";

import * as Popover from "@radix-ui/react-popover";
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Ellipsis,
  Eye,
  ImagePlus,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  UnitArchiveState,
  UnitDisplayMode,
  UnitSortKey,
  UnitSummary,
} from "@/features/units/unit.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const unitRowClassName =
  "cursor-pointer border-t border-border outline-none transition-colors hover:bg-surface-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring";
const selectedUnitRowClassName =
  "bg-state-selected shadow-[inset_3px_0_0_var(--record-spine)]";

type UnitsTableProps = {
  displayMode: UnitDisplayMode;
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onOpenUnit: (id: string) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  onSelectUnit: (id: string) => void;
  onSortChange: (sort: UnitSortKey) => void;
  selectedUnitId: string;
  sort: UnitSortKey;
  archiveState: UnitArchiveState;
  units: UnitSummary[];
};

export function UnitsTable({
  archiveState,
  displayMode,
  onArchiveUnit,
  onEditUnit,
  onOpenUnit,
  onRestoreUnit,
  onSelectUnit,
  onSortChange,
  selectedUnitId,
  sort,
  units,
}: UnitsTableProps) {
  const pendingPreviewRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingPreviewRef.current) {
        clearTimeout(pendingPreviewRef.current);
      }
    };
  }, []);

  function scheduleUnitPreview(unitId: string) {
    if (pendingPreviewRef.current) {
      clearTimeout(pendingPreviewRef.current);
    }

    pendingPreviewRef.current = setTimeout(() => {
      pendingPreviewRef.current = null;
      onSelectUnit(unitId);
    }, 180);
  }

  function openUnitRecord(unitId: string) {
    if (pendingPreviewRef.current) {
      clearTimeout(pendingPreviewRef.current);
      pendingPreviewRef.current = null;
    }

    onOpenUnit(unitId);
  }

  return (
    <div className="h-full min-h-0">
      <div
        className={cn(
          displayMode === "cards"
            ? "grid h-full min-h-[380px] auto-rows-max content-start items-start gap-3 overflow-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3"
            : "max-h-[380px] space-y-3 overflow-auto pr-1 md:hidden",
        )}
      >
        {units.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted sm:col-span-2 xl:col-span-3">
            {getEmptyMessage(archiveState)}
          </p>
        ) : null}
        {units.map((unit) => (
          <UnitCard
            key={unit.id}
            onArchiveUnit={onArchiveUnit}
            onEditUnit={onEditUnit}
            onRestoreUnit={onRestoreUnit}
            onSelectUnit={onSelectUnit}
            selected={selectedUnitId === unit.id}
            unit={unit}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div className="hidden h-full overflow-hidden rounded-md border border-border bg-surface md:block">
          <div className="h-full min-h-[540px] overflow-auto">
            <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
                <tr>
                  <SortableHeader
                    active={sort === "property_asc"}
                    direction="ascending"
                    label="Property"
                    onClick={() => onSortChange("property_asc")}
                    sortLabel="Sort units by property"
                  />
                  <SortableHeader
                    active={sort === "unit_asc"}
                    direction="ascending"
                    label="Unit"
                    onClick={() => onSortChange("unit_asc")}
                    sortLabel="Sort units by unit number"
                  />
                  <SortableHeader
                    active={sort === "status_asc"}
                    align="center"
                    direction="ascending"
                    label="Status"
                    onClick={() => onSortChange("status_asc")}
                    sortLabel="Sort units by status"
                  />
                  <SortableHeader
                    active={sort === "rent_desc"}
                    align="right"
                    direction="descending"
                    label="Rent"
                    onClick={() => onSortChange("rent_desc")}
                    sortLabel="Sort units by rent"
                  />
                  <SortableHeader
                    active={sort === "net_desc"}
                    align="right"
                    direction="descending"
                    label="Net"
                    onClick={() => onSortChange("net_desc")}
                    sortLabel="Sort units by net"
                  />
                  <th className="px-1.5 py-2.5 font-semibold">
                    Lease / Tenant
                  </th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-8 text-center text-muted" colSpan={6}>
                      {getEmptyMessage(archiveState)}
                    </td>
                  </tr>
                ) : null}
                {units.map((unit) => (
                  <tr
                    aria-selected={selectedUnitId === unit.id}
                    className={cn(
                      unitRowClassName,
                      selectedUnitId === unit.id && selectedUnitRowClassName,
                      unit.isArchived && "text-muted",
                    )}
                    key={unit.id}
                    onClick={() => scheduleUnitPreview(unit.id)}
                    onDoubleClick={() => openUnitRecord(unit.id)}
                    onKeyDown={(event) => {
                      if (event.currentTarget !== event.target) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectUnit(unit.id);
                      }
                    }}
                    tabIndex={0}
                    title="Click: quick view · Double-click: full record"
                  >
                    <td className="px-2.5 py-2">
                      <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5">
                        <UnitThumbnail unit={unit} />
                        <div className="min-w-0">
                          <p
                            className="truncate font-medium"
                            title={unit.propertyCode}
                          >
                            {unit.propertyCode}
                          </p>
                          <p
                            className="mt-0.5 truncate text-xs text-muted"
                            title={unit.propertyName}
                          >
                            {unit.propertyName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-2">
                      <Link
                        aria-label={`Unit ${unit.unitNumber}`}
                        className="block truncate rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        href={`/units/${unit.id}`}
                        onClick={(event) => event.stopPropagation()}
                        prefetch={false}
                        title={`Unit ${unit.unitNumber}`}
                      >
                        {unit.unitNumber}
                      </Link>
                    </td>
                    <td className="px-1.5 py-2">
                      <div className="flex flex-wrap justify-center gap-1.5">
                        <Badge className="px-2 text-xs" tone={unit.statusTone}>
                          {unit.statusLabel}
                        </Badge>
                        {unit.isArchived ? (
                          <Badge className="px-2 text-xs" tone="warning">
                            Archived
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {unit.rentDisplay ? (
                        <TableMoneyDisplay value={unit.rentDisplay} />
                      ) : (
                        <span className="block text-right font-medium">
                          {unit.rentLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <TableMoneyDisplay value={unit.ledgerNetDisplay} />
                    </td>
                    <td className="px-1.5 py-2">
                      <p className="line-clamp-2 break-words leading-[18px]">
                        {unit.leaseLabel}
                      </p>
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

function getEmptyMessage(archiveState: UnitArchiveState) {
  if (archiveState === "archived") {
    return "No archived units.";
  }

  if (archiveState === "all") {
    return "No units yet.";
  }

  return "No active units yet.";
}

function UnitCard({
  onArchiveUnit,
  onEditUnit,
  onRestoreUnit,
  onSelectUnit,
  selected,
  unit,
}: {
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  onSelectUnit: (id: string) => void;
  selected: boolean;
  unit: UnitSummary;
}) {
  return (
    <article
      className={cn(
        "group min-w-0 overflow-hidden rounded-md border border-border bg-surface text-sm transition-colors hover:border-record-spine",
        selected && "border-record-spine bg-state-selected",
        unit.isArchived && "text-muted",
      )}
      data-selected={selected ? "true" : "false"}
    >
      <UnitPhoto unit={unit} />

      <div className="px-3 py-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              aria-label={`Unit ${unit.unitNumber}`}
              className="block truncate rounded-sm text-sm font-semibold leading-5 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              href={`/units/${unit.id}`}
              prefetch={false}
              title={`Unit ${unit.unitNumber}`}
            >
              Unit {unit.unitNumber}
            </Link>
            <p className="mt-1 truncate font-medium" title={unit.propertyName}>
              {unit.propertyName}
            </p>
            <p
              className="mt-0.5 truncate text-[13px] text-foreground-muted"
              title={unit.propertyCode}
            >
              {unit.propertyCode}
            </p>
          </div>
          <UnitStatusBadges unit={unit} />
        </div>

        <div className="mt-3 grid gap-2">
          <div className="flex items-center justify-end gap-3">
            {unit.rentDisplay ? (
              <TableMoneyDisplay value={unit.rentDisplay} />
            ) : (
              <span className="font-semibold">{unit.rentLabel}</span>
            )}
          </div>
          <p className="line-clamp-2 leading-5 text-foreground-muted">
            {unit.leaseLabel}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
          <button
            aria-label={`Quick view unit ${unit.unitNumber}`}
            aria-pressed={selected}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
              selected && "border-record-spine bg-state-selected",
            )}
            onClick={() => onSelectUnit(unit.id)}
            type="button"
          >
            <Eye aria-hidden="true" className="size-3.5" />
            Quick view
          </button>
          <UnitActions
            className="justify-end gap-1"
            onArchiveUnit={onArchiveUnit}
            onEditUnit={onEditUnit}
            onRestoreUnit={onRestoreUnit}
            size="touch"
            unit={unit}
          />
        </div>
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

function UnitActions({
  className,
  onArchiveUnit,
  onEditUnit,
  onRestoreUnit,
  size = "compact",
  unit,
}: {
  className?: string;
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  size?: "compact" | "touch";
  unit: UnitSummary;
}) {
  const wrapperClassName = cn("flex justify-center gap-1", className);
  const triggerClassName = cn(
    "inline-flex items-center justify-center rounded-md border border-transparent text-muted outline-none transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring data-[state=open]:border-border data-[state=open]:bg-surface-muted data-[state=open]:text-foreground",
    size === "touch" ? "h-9 w-9" : "h-8 w-8",
  );

  return (
    <div className={wrapperClassName}>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            aria-label={`Open actions for unit ${unit.unitNumber}`}
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
            className="z-50 w-40 rounded-md border border-border bg-surface p-1.5 text-sm shadow-lg"
            onClick={(event) => event.stopPropagation()}
            side="bottom"
            sideOffset={6}
          >
            {unit.isArchived ? (
              <UnitActionMenuButton
                icon={<RotateCcw size={14} />}
                label="Restore"
                onClick={() => onRestoreUnit(unit)}
              />
            ) : (
              <>
                <UnitActionMenuButton
                  icon={<ImagePlus size={14} />}
                  label={unit.thumbnailUrl ? "Add photo" : "Upload photo"}
                  onClick={() => onEditUnit(unit)}
                />
                <UnitActionMenuButton
                  icon={<Pencil size={14} />}
                  label="Edit"
                  onClick={() => onEditUnit(unit)}
                />
                <UnitActionMenuButton
                  danger
                  icon={<Archive size={14} />}
                  label="Archive"
                  onClick={() => onArchiveUnit(unit)}
                />
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function UnitActionMenuButton({
  danger = false,
  icon,
  label,
  onClick,
}: {
  danger?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Popover.Close asChild>
      <button
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
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

function UnitStatusBadges({ unit }: { unit: UnitSummary }) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
      <Badge tone={unit.statusTone}>{unit.statusLabel}</Badge>
      {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
    </div>
  );
}

function UnitThumbnail({ unit }: { unit: UnitSummary }) {
  const className =
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted text-muted";

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
    <span className={className} aria-hidden="true">
      <Building2 size={16} />
    </span>
  );
}

function UnitPhoto({ unit }: { unit: UnitSummary }) {
  const className =
    "flex h-36 w-full items-center justify-center bg-surface-muted text-muted";

  if (unit.thumbnailUrl) {
    return (
      <div
        aria-hidden="true"
        className={cn(className, "bg-cover bg-center")}
        style={{ backgroundImage: `url(${unit.thumbnailUrl})` }}
      />
    );
  }

  return (
    <div className={className} aria-hidden="true">
      <Building2 size={24} />
    </div>
  );
}

function TableMoneyDisplay({
  compact = false,
  value,
}: {
  compact?: boolean;
  value: MoneyDisplayValue;
}) {
  const primary = formatMoneyWithSymbol(value.primary);

  return (
    <span
      className={cn(
        "flex min-w-0 items-center justify-end whitespace-nowrap text-right tabular-nums",
        compact ? "gap-1 text-xs leading-4" : "gap-1.5 text-sm leading-5",
      )}
      title={primary}
    >
      <span className="font-semibold text-foreground">{primary}</span>
    </span>
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
