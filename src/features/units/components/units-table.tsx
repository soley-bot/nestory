import * as Popover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
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
import type {
  UnitArchiveState,
  UnitDisplayMode,
  UnitSummary,
} from "@/features/units/unit.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type UnitsTableProps = {
  displayMode: UnitDisplayMode;
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  onOpenUnit: (id: string) => void;
  onSelectUnit: (id: string) => void;
  selectedUnitId: string;
  archiveState: UnitArchiveState;
  units: UnitSummary[];
};

export function UnitsTable({
  archiveState,
  displayMode,
  onArchiveUnit,
  onEditUnit,
  onRestoreUnit,
  onOpenUnit,
  onSelectUnit,
  selectedUnitId,
  units,
}: UnitsTableProps) {
  return (
    <div>
      <div
        className={cn(
          displayMode === "cards"
            ? "grid max-h-[380px] gap-3 overflow-auto pr-1 sm:grid-cols-2 lg:max-h-none lg:overflow-visible lg:pr-0 xl:grid-cols-3 2xl:grid-cols-3"
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
            onOpenUnit={onOpenUnit}
            onRestoreUnit={onRestoreUnit}
            onSelectUnit={onSelectUnit}
            selected={selectedUnitId === unit.id}
            unit={unit}
          />
        ))}
      </div>

      {displayMode === "table" ? (
        <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
          <div className="max-h-[min(620px,calc(100vh-320px))] overflow-auto">
            <table className="w-full min-w-[940px] table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[10%]" />
                <col className="w-[7%]" />
                <col className="w-[10%]" />
                <col className="w-[13%]" />
                <col className="w-[31%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th className="px-2.5 py-2.5 font-semibold">Property</th>
                  <th className="px-1.5 py-2.5 font-semibold">Unit</th>
                  <th className="px-1.5 py-2.5 text-center font-semibold">
                    Floor
                  </th>
                  <th className="px-1.5 py-2.5 text-center font-semibold">
                    Status
                  </th>
                  <th className="px-2 py-2.5 text-right font-semibold">Rent</th>
                  <th className="px-1.5 py-2.5 font-semibold">
                    Lease / Tenant
                  </th>
                  <th className="px-2 py-2.5 text-center font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-8 text-center text-muted" colSpan={7}>
                      {getEmptyMessage(archiveState)}
                    </td>
                  </tr>
                ) : null}
                {units.map((unit) => (
                  <tr
                    className={cn(
                      previewRowClassName,
                      selectedUnitId === unit.id && selectedPreviewRowClassName,
                      unit.isArchived && "text-muted",
                    )}
                    key={unit.id}
                    onClick={() => onSelectUnit(unit.id)}
                    onDoubleClick={() => onOpenUnit(unit.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectUnit(unit.id);
                      }
                    }}
                    tabIndex={0}
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
                      <RecordLink
                        href={`/units/${unit.id}`}
                        title={`Open full unit record: Unit ${unit.unitNumber}`}
                      >
                        {unit.unitNumber}
                      </RecordLink>
                    </td>
                    <td className="px-1.5 py-2 text-center text-muted">
                      {unit.floorLabel}
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
                    <td className="px-1.5 py-2">
                      <p className="line-clamp-2 break-words leading-[18px]">
                        {unit.leaseLabel}
                      </p>
                    </td>
                    <td className="px-2 py-2">
                      <UnitActions
                        onArchiveUnit={onArchiveUnit}
                        onEditUnit={onEditUnit}
                        onRestoreUnit={onRestoreUnit}
                        unit={unit}
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
  onOpenUnit,
  onRestoreUnit,
  onSelectUnit,
  selected,
  unit,
}: {
  onArchiveUnit: (unit: UnitSummary) => void;
  onEditUnit: (unit: UnitSummary) => void;
  onOpenUnit: (id: string) => void;
  onRestoreUnit: (unit: UnitSummary) => void;
  onSelectUnit: (id: string) => void;
  selected: boolean;
  unit: UnitSummary;
}) {
  return (
    <article
      className={cn(
        "group min-w-0 cursor-pointer overflow-hidden rounded-md border border-border bg-surface text-sm transition-colors hover:border-[#c9d0da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        selected && "border-accent shadow-[0_0_0_1px_var(--accent)]",
        unit.isArchived && "text-muted",
      )}
      onClick={() => onSelectUnit(unit.id)}
      onDoubleClick={() => onOpenUnit(unit.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectUnit(unit.id);
        }
      }}
      tabIndex={0}
    >
      <UnitPhoto unit={unit} />

      <div className="px-3.5 py-3.5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <RecordLink
              className="text-base font-semibold leading-5"
              href={`/units/${unit.id}`}
              title={`Open full unit record: Unit ${unit.unitNumber}`}
            >
              Unit {unit.unitNumber}
            </RecordLink>
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
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground-muted">Floor {unit.floorLabel}</span>
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

        <div className="mt-3 flex justify-end border-t border-border pt-2">
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
    "flex aspect-[4/3] w-full items-center justify-center bg-surface-muted text-muted";

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
