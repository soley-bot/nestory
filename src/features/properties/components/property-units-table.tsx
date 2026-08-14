import Link from "next/link";
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
          <Link
            className={cn(
              "block rounded-md border border-border bg-card p-4 text-sm transition-colors hover:bg-muted/35",
              unit.isArchived && "text-muted-foreground",
            )}
            href={`/units/${unit.id}`}
            key={unit.id}
            prefetch={false}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">Unit {unit.unitNumber}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {unit.tenantName ?? formatFloor(unit.floor)}
                </p>
              </div>
              <UnitStatusBadges unit={unit} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Detail label="Lease ends" value={unit.leaseEndLabel} />
              <Detail
                alignRight
                label="Monthly rent"
                value={
                  unit.monthlyRentDisplay ? (
                    <MoneyDisplay align="right" value={unit.monthlyRentDisplay} />
                  ) : (
                    unit.monthlyRent
                  )
                }
              />
              <Detail label="Attention" value={unit.attention} />
            </dl>
          </Link>
        ))}
      </div>

      <div
        aria-label="Property units table"
        className="hidden overflow-x-auto md:block"
        role="region"
      >
        <table className="w-full min-w-[800px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[28%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead className="bg-[var(--table-header-bg)] text-xs uppercase tracking-[0] text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Unit</th>
              <th className="px-2 py-2.5 font-semibold">Occupancy / tenant</th>
              <th className="px-2 py-2.5 font-semibold">Lease ends</th>
              <th className="px-2 py-2.5 text-right font-semibold">Monthly rent</th>
              <th className="px-3 py-2.5 text-right font-semibold">Attention</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr
                className={cn(
                  "border-t border-border transition-colors hover:bg-muted/35",
                  unit.isArchived && "text-muted-foreground",
                )}
                key={unit.id}
              >
                <td className="px-3 py-2.5">
                  <UnitLabel unit={unit} />
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusBadge status={unit.occupancy} />
                    {unit.tenantName ? (
                      <span className="truncate text-muted-foreground">
                        {unit.tenantName}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-muted-foreground">
                  {unit.leaseEndLabel}
                </td>
                <td className="px-2 py-2.5">
                  {unit.monthlyRentDisplay ? (
                    <MoneyDisplay align="right" value={unit.monthlyRentDisplay} />
                  ) : (
                    <span className="block text-right text-muted-foreground">
                      {unit.monthlyRent}
                    </span>
                  )}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right text-muted-foreground",
                    unit.attention !== "—" && "font-medium text-warning",
                  )}
                >
                  {unit.attention}
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
      className="break-words font-medium text-primary hover:underline"
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
      <StatusBadge status={unit.occupancy} />
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
  value: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", alignRight && "text-right")}>
      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
