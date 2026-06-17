import Link from "next/link";
import type { ReactNode } from "react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import type { PropertyDetailUnit } from "@/features/properties/data/property-detail";
import { cn } from "@/lib/utils";

export function PropertyUnitsTable({
  units,
}: {
  units: PropertyDetailUnit[];
}) {
  return (
    <div>
      <div className="space-y-3 md:hidden">
        {units.map((unit) => (
          <article
            className={cn(
              "rounded-md border border-border bg-surface p-4 text-sm",
              unit.isArchived && "text-muted",
            )}
            key={unit.id}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <UnitLabel unit={unit} />
                <p className="mt-1 text-xs text-muted">{formatFloor(unit.floor)}</p>
              </div>
              <UnitStatusBadges unit={unit} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Detail
                label="Current rent"
                value={
                  unit.currentRentDisplay ? (
                    <MoneyDisplay value={unit.currentRentDisplay} />
                  ) : (
                    unit.currentRent
                  )
                }
              />
              <Detail label="Status" value={unit.status} alignRight />
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
        <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[180px]" />
            <col className="w-[96px]" />
            <col className="w-[160px]" />
            <col className="w-[150px]" />
            <col />
          </colgroup>
          <thead className="bg-surface-muted text-xs uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Unit</th>
              <th className="px-3 py-3 font-semibold">Floor</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 text-right font-semibold">
                Current rent
              </th>
              <th className="px-3 py-3 font-semibold">Archive</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr
                className={cn(
                  "border-t border-border",
                  unit.isArchived && "text-muted",
                )}
                key={unit.id}
              >
                <td className="px-4 py-3">
                  <UnitLabel unit={unit} />
                </td>
                <td className="px-3 py-3 break-words text-muted">
                  {unit.floor}
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={unit.status} />
                </td>
                <td className="px-3 py-3">
                  {unit.currentRentDisplay ? (
                    <MoneyDisplay align="right" value={unit.currentRentDisplay} />
                  ) : (
                    <span className="block text-right font-medium">
                      {unit.currentRent}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {unit.isArchived ? (
                    <Badge tone="warning">Archived</Badge>
                  ) : (
                    <span className="text-muted">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnitLabel({ unit }: { unit: PropertyDetailUnit }) {
  if (unit.isArchived) {
    return <span className="break-words font-medium">Unit {unit.unitNumber}</span>;
  }

  return (
    <Link
      className="break-words font-medium text-accent hover:underline"
      href={`/units/${unit.id}`}
      prefetch={false}
    >
      Unit {unit.unitNumber}
    </Link>
  );
}

function formatFloor(floor: string) {
  return floor === "Not set" ? "Floor not set" : `Floor ${floor}`;
}

function UnitStatusBadges({ unit }: { unit: PropertyDetailUnit }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <StatusBadge status={unit.status} />
      {unit.isArchived ? <Badge tone="warning">Archived</Badge> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "occupied"
      ? "success"
      : normalized === "vacant"
        ? "neutral"
        : normalized === "reserved"
          ? "accent"
          : "warning";

  return <Badge tone={tone}>{status}</Badge>;
}

function Detail({
  alignRight = false,
  label,
  value,
}: {
  alignRight?: boolean;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", alignRight && "text-right")}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
