"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { OverviewMaintenancePoint } from "@/features/overview/overview.types";

export function MaintenancePropertyPreviewList({
  rows,
}: {
  rows: OverviewMaintenancePoint[];
}) {
  const [selectedRow, setSelectedRow] = useState<OverviewMaintenancePoint | null>(null);

  return (
    <>
      <section className="min-w-0 max-w-full overflow-hidden border-y border-border">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold">Maintenance priorities</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Properties ranked by overdue, high-priority, and open maintenance work.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_90px_160px_20px] gap-3 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted max-md:hidden">
          <span>Property</span>
          <span>Open</span>
          <span>Priority</span>
          <span aria-hidden="true" />
        </div>
        {rows.length > 0 ? (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <button
                className="group grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring md:grid-cols-[minmax(0,1fr)_90px_160px_20px]"
                key={row.href}
                onClick={() => setSelectedRow(row)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{row.label}</span>
                  <span className="mt-0.5 block text-xs text-foreground-muted md:hidden">
                    {prioritySummary(row)}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{row.openCount}</span>
                <span className="hidden truncate text-xs text-foreground-muted md:block">
                  {prioritySummary(row)}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="hidden text-foreground-muted transition-transform group-hover:translate-x-0.5 md:block"
                  size={14}
                />
              </button>
            ))}
          </div>
        ) : (
          <p className="px-3 py-8 text-sm text-foreground-muted">
            No open maintenance work is visible.
          </p>
        )}
      </section>

      <Modal
        description="Open maintenance work for this property."
        onClose={() => setSelectedRow(null)}
        open={selectedRow !== null}
        title={selectedRow?.label ?? "Maintenance preview"}
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
            <section className="border-t border-border">
              <div className="px-4 py-3">
                <h3 className="text-sm font-semibold">Current cases</h3>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  Highest priority work appears first.
                </p>
              </div>
              <div className="divide-y divide-border border-t border-border">
                {selectedRow.cases.map((maintenanceCase) => (
                  <Link
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-surface-muted"
                    href={maintenanceCase.href}
                    key={maintenanceCase.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {maintenanceCase.title}
                      </span>
                      <span className="mt-0.5 block text-xs capitalize text-foreground-muted">
                        {formatStatus(maintenanceCase.status)} · {maintenanceCase.priority} priority
                        {maintenanceCase.dueDate ? ` · Due ${formatDate(maintenanceCase.dueDate)}` : ""}
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="text-foreground-muted transition-transform group-hover:translate-x-0.5"
                      size={14}
                    />
                  </Link>
                ))}
              </div>
            </section>
            <div className="flex justify-end border-t border-border px-4 py-3">
              <Link
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                href={selectedRow.href}
              >
                Open property maintenance
                <ArrowRight size={13} />
              </Link>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function prioritySummary(row: OverviewMaintenancePoint) {
  if (row.overdueCount > 0) {
    return `${row.overdueCount} overdue`;
  }
  if (row.urgentCount > 0) {
    return `${row.urgentCount} high priority`;
  }
  if (row.blockedCount > 0) {
    return `${row.blockedCount} blocked`;
  }
  return "Open queue";
}

function modalFacts(row: OverviewMaintenancePoint): Array<[string, string]> {
  return [
    ["Open cases", String(row.openCount)],
    ["Overdue", String(row.overdueCount)],
    ["High priority", String(row.urgentCount)],
    ["Blocked", String(row.blockedCount)],
  ];
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
