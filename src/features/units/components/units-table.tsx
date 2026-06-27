import Link from "next/link";
import { Archive, ExternalLink, Pencil, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  UnitArchiveState,
  UnitDisplayMode,
  UnitSummary,
} from "@/features/units/unit.types";
import type {
  CurrencyCode,
  MoneyDisplayValue,
} from "@/lib/money/format";
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
            <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[9%]" />
                <col className="w-[7%]" />
                <col className="w-[11%]" />
                <col className="w-[23%]" />
                <col className="w-[20%]" />
                <col className="w-[10%]" />
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
                  <th className="px-1.5 py-2.5 text-center font-semibold">
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
                      "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      selectedUnitId === unit.id && "bg-surface-muted",
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
                    </td>
                    <td className="px-1.5 py-2">
                      <Link
                        className="block truncate font-medium text-accent hover:underline"
                        href={`/units/${unit.id}`}
                        onClick={(event) => event.stopPropagation()}
                        prefetch={false}
                        title={`Unit ${unit.unitNumber}`}
                      >
                        {unit.unitNumber}
                      </Link>
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
                    <td className="px-1.5 py-2">
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
        "group min-w-0 cursor-pointer rounded-md border border-border bg-surface px-3.5 py-3.5 text-sm transition-colors hover:border-[#c9d0da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
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
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="block truncate text-base font-semibold leading-5 text-accent hover:underline"
            href={`/units/${unit.id}`}
            onClick={(event) => event.stopPropagation()}
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
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground-muted">Floor {unit.floorLabel}</span>
          {unit.rentDisplay ? (
            <TableMoneyDisplay showSecondary={false} value={unit.rentDisplay} />
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
  const baseClassName = cn("flex justify-center gap-0.5", className);
  const buttonClassName = cn(
    "inline-flex items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50",
    size === "touch" ? "h-9 w-9" : "h-[26px] w-[26px]",
  );

  if (unit.isArchived) {
    return (
      <div
        className={baseClassName}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Link
          aria-label={`Open unit ${unit.unitNumber}`}
          className={cn(buttonClassName, "hover:text-foreground")}
          href={`/units/${unit.id}`}
          onClick={(event) => event.stopPropagation()}
          prefetch={false}
          title="Open unit"
        >
          <ExternalLink size={14} />
        </Link>
        <button
          aria-label={`Restore unit ${unit.unitNumber}`}
          className={cn(buttonClassName, "hover:text-accent")}
          onClick={(event) => {
            event.stopPropagation();
            onRestoreUnit(unit);
          }}
          title="Restore unit"
          type="button"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={baseClassName}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Link
        aria-label={`Open unit ${unit.unitNumber}`}
        className={cn(buttonClassName, "hover:text-foreground")}
        href={`/units/${unit.id}`}
        onClick={(event) => event.stopPropagation()}
        prefetch={false}
        title="Open unit"
      >
        <ExternalLink size={14} />
      </Link>
      <button
        aria-label={`Edit unit ${unit.unitNumber}`}
        className={cn(buttonClassName, "hover:text-foreground")}
        onClick={(event) => {
          event.stopPropagation();
          onEditUnit(unit);
        }}
        title="Edit unit"
        type="button"
      >
        <Pencil size={14} />
      </button>
      <button
        aria-label={`Archive unit ${unit.unitNumber}`}
        className={cn(buttonClassName, "hover:text-danger")}
        onClick={(event) => {
          event.stopPropagation();
          onArchiveUnit(unit);
        }}
        title="Archive unit"
        type="button"
      >
        <Archive size={14} />
      </button>
    </div>
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

function TableMoneyDisplay({
  compact = false,
  showSecondary = true,
  value,
}: {
  compact?: boolean;
  showSecondary?: boolean;
  value: MoneyDisplayValue;
}) {
  const primary = formatMoneyWithSymbol(value.primary, value.primaryCurrency);
  const secondary = formatMoneyWithSymbol(
    value.secondary,
    value.secondaryCurrency,
  );

  return (
    <span
      className={cn(
        "flex min-w-0 items-center justify-end whitespace-nowrap text-right tabular-nums",
        compact ? "gap-1 text-xs leading-4" : "gap-1.5 text-sm leading-5",
      )}
      title={showSecondary ? `${primary} / ${secondary}` : primary}
    >
      <span className="font-semibold text-foreground">{primary}</span>
      {showSecondary ? (
        <>
          <span className="text-muted">/</span>
          <span
            className={compact ? "text-xs text-muted" : "text-[13px] text-muted"}
          >
            {secondary}
          </span>
        </>
      ) : null}
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
