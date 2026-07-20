"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { OverviewRecordPoint } from "@/features/overview/overview.types";

export function RecordsPropertyPreviewList({ rows }: { rows: OverviewRecordPoint[] }) {
  const [selectedRow, setSelectedRow] = useState<OverviewRecordPoint | null>(null);

  return (
    <>
      <section className="min-w-0 max-w-full overflow-hidden border-y border-border">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold">Record readiness</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Properties ranked by statement blockers and missing record links.
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px_160px_20px] gap-3 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted max-md:hidden">
          <span>Property</span>
          <span>Record issues</span>
          <span>Readiness</span>
          <span aria-hidden="true" />
        </div>
        {rows.length > 0 ? (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <button
                className="group grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring md:grid-cols-[minmax(0,1fr)_100px_160px_20px]"
                key={row.href}
                onClick={() => setSelectedRow(row)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{row.label}</span>
                  <span className="mt-0.5 block text-xs text-foreground-muted md:hidden">
                    {readinessSummary(row)}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{totalBlockers(row)}</span>
                <span className="hidden truncate text-xs text-foreground-muted md:block">
                  {readinessSummary(row)}
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
            No property records are available for review.
          </p>
        )}
      </section>

      <Modal
        description="Linked records and owner-statement readiness for this property."
        onClose={() => setSelectedRow(null)}
        open={selectedRow !== null}
        title={selectedRow?.label ?? "Record readiness"}
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
              <h3 className="text-sm font-semibold">Readiness</h3>
              <p className="mt-1 text-xs leading-5 text-foreground-muted">
                {readinessDetail(selectedRow)}
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

function totalBlockers(row: OverviewRecordPoint) {
  return row.statementBlockers + row.missingTenantLinks;
}

function readinessSummary(row: OverviewRecordPoint) {
  if (row.statementBlockers > 0) {
    return `${row.statementBlockers} statement ${row.statementBlockers === 1 ? "blocker" : "blockers"}`;
  }
  if (!row.ownerLinked) return "Owner link missing";
  if (row.missingTenantLinks > 0) {
    return `${row.missingTenantLinks} tenant ${row.missingTenantLinks === 1 ? "link" : "links"} missing`;
  }
  return row.readyStatementCount === 1
    ? "1 owner statement ready"
    : `${row.readyStatementCount} owner statements ready`;
}

function modalFacts(row: OverviewRecordPoint): Array<[string, string]> {
  return [
    ["Statement blockers", String(row.statementBlockers)],
    ["Owner statements ready", String(row.readyStatementCount)],
    ["Owner linked", row.ownerLinked ? "Yes" : "No"],
    ["Missing tenant links", String(row.missingTenantLinks)],
    ["Documents", String(row.documentCount)],
    ["Units", String(row.unitCount)],
    ["Status", totalBlockers(row) === 0 && row.ownerLinked ? "Ready" : "Needs review"],
  ];
}

function readinessDetail(row: OverviewRecordPoint) {
  const issues = [
    !row.ownerLinked ? "link an owner" : null,
    row.missingTenantLinks > 0
      ? `repair ${row.missingTenantLinks} tenant ${row.missingTenantLinks === 1 ? "link" : "links"}`
      : null,
    row.statementBlockers > 0
      ? `resolve ${row.statementBlockers} statement ${row.statementBlockers === 1 ? "blocker" : "blockers"}`
      : null,
  ].filter((issue): issue is string => issue !== null);

  return issues.length > 0
    ? `Before statement review, ${joinIssues(issues)}.`
    : "Owner, tenant, and statement checks are ready for review.";
}

function joinIssues(issues: string[]) {
  if (issues.length === 1) return issues[0];
  if (issues.length === 2) return `${issues[0]} and ${issues[1]}`;
  return `${issues.slice(0, -1).join(", ")}, and ${issues.at(-1)}`;
}
