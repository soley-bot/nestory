"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { OverviewOccupancyPoint } from "@/features/overview/overview.types";

export function LeasingPropertyPreviewList({
  expiringLeaseCount,
  month,
  rows,
}: {
  expiringLeaseCount: number;
  month: string;
  rows: OverviewOccupancyPoint[];
}) {
  const [selectedRow, setSelectedRow] = useState<OverviewOccupancyPoint | null>(null);

  return (
    <>
      <section className="min-w-0 max-w-full overflow-hidden border-y border-border">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold">Leasing priorities</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Compare occupancy, then open a property for the leasing follow-up.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px_140px_20px] gap-3 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted max-md:hidden">
          <span>Property</span>
          <span>Occupancy</span>
          <span>Follow-up</span>
          <span aria-hidden="true" />
        </div>
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <button
              className="group grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring md:grid-cols-[minmax(0,1fr)_100px_140px_20px]"
              key={row.href}
              onClick={() => setSelectedRow(row)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{row.label}</span>
                <span className="mt-0.5 block text-xs text-foreground-muted md:hidden">
                  {formatFollowUp(row)}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{row.percent}%</span>
              <span className="hidden truncate text-xs text-foreground-muted md:block">
                {formatFollowUp(row)}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="hidden text-foreground-muted transition-transform group-hover:translate-x-0.5 md:block"
                size={14}
              />
            </button>
          ))}
        </div>
      </section>

      <Modal
        description={`Leasing position for ${formatMonthLabel(month)}.`}
        onClose={() => setSelectedRow(null)}
        open={selectedRow !== null}
        title={selectedRow?.label ?? "Leasing preview"}
      >
        {selectedRow ? (
          <>
            <div className="grid gap-px bg-border sm:grid-cols-2">
              {modalFacts(selectedRow).map(([label, value]) => (
                <div className="bg-surface px-4 py-3" key={label}>
                  <p className="text-xs text-foreground-muted">{label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <section className="border-t border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Attention and readiness</h3>
              <p className="mt-1 text-xs leading-5 text-foreground-muted">
                {selectedRow.unoccupiedUnits > 0
                  ? `${selectedRow.unoccupiedUnits} ${unitWord(selectedRow.unoccupiedUnits)} need occupancy or lease follow-up.`
                  : "No occupancy gap is visible for this property."}{" "}
                {expiringLeaseCount > 0
                  ? `${expiringLeaseCount} lease ${expiringLeaseCount === 1 ? "expiry" : "expiries"} need review across the portfolio.`
                  : "No near-term lease expiries are visible across the portfolio."}
              </p>
            </section>
            <div className="flex justify-end border-t border-border px-4 py-3">
              <Link
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                href={selectedRow.href}
              >
                Open property record
                <ArrowRight size={13} />
              </Link>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function formatFollowUp(row: OverviewOccupancyPoint) {
  if (row.unoccupiedUnits === 0) return "No occupancy gap";
  return `${row.unoccupiedUnits} ${unitWord(row.unoccupiedUnits)} to review`;
}

function modalFacts(row: OverviewOccupancyPoint): Array<[string, string]> {
  return [
    ["Occupancy", `${row.percent}%`],
    ["Occupied units", `${row.occupiedUnits} of ${row.totalUnits}`],
    ["Unoccupied units", String(row.unoccupiedUnits)],
    ["Marked vacant", String(row.vacantUnits)],
  ];
}

function unitWord(count: number) {
  return count === 1 ? "unit" : "units";
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
