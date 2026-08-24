"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ReportsViewQuery,
  TrustedReport,
  TrustedReportRow,
} from "@/features/reports/reports.types";
import { cn } from "@/lib/utils";

type ReportResultsTableProps = {
  report: TrustedReport;
  reportRowCount: number;
  viewQuery: ReportsViewQuery;
};

type DisplayColumn =
  | { align?: "left" | "right"; key: string; label: string; type: "value" }
  | {
      align?: "left" | "right";
      key: "scope";
      label: string;
      type: "scope";
    }
  | {
      align: "right";
      key: "expenses";
      label: string;
      type: "owner-expenses";
    };

export function ReportResultsTable({
  report,
  reportRowCount,
  viewQuery,
}: ReportResultsTableProps) {
  const [activeRow, setActiveRow] = React.useState<TrustedReportRow | null>(
    null,
  );
  const [showZeroActivity, setShowZeroActivity] = React.useState(false);
  const zeroActivityRows =
    report.kind === "unit-profit-loss"
      ? report.rows.filter((row) => !hasFinancialActivity(row))
      : [];
  const rows =
    report.kind === "unit-profit-loss" && !showZeroActivity
      ? report.rows.filter(hasFinancialActivity)
      : report.rows;
  const columns = displayColumns(report);
  const countLabel =
    report.kind === "unit-profit-loss"
      ? `${reportRowCount} ${reportRowCount === 1 ? "scope" : "scopes"}`
      : `${reportRowCount} ${reportRowCount === 1 ? "property" : "properties"}`;

  return (
    <>
      <section className="border-t border-border" data-slot="report-table-frame">
        <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border py-2">
          <h2 className="min-w-0 text-sm font-semibold text-foreground">
            {report.title}
          </h2>
          <span className="text-xs text-muted-foreground">{countLabel}</span>
          {zeroActivityRows.length > 0 ? (
            <Button
              className="ml-auto h-7 px-2 text-xs"
              onClick={() => setShowZeroActivity((current) => !current)}
              type="button"
              variant="ghost"
            >
              {showZeroActivity
                ? "Hide scopes with no activity"
                : `Show ${zeroActivityRows.length} ${zeroActivityRows.length === 1 ? "scope" : "scopes"} with no activity`}
            </Button>
          ) : null}
        </div>

        <div
          aria-label={`${report.title} table`}
          className="max-w-full overflow-x-auto"
          role="region"
          tabIndex={0}
        >
          <Table aria-label={report.title} className="min-w-[600px] text-sm">
            <TableHeader className="bg-muted/35 text-xs uppercase tracking-[0.02em] text-muted-foreground">
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    className={cn(
                      "h-9 px-3 font-semibold text-muted-foreground",
                      column.align === "right" && "text-right",
                    )}
                    key={column.key}
                  >
                    {column.label}
                  </TableHead>
                ))}
                <TableHead className="h-9 w-12 px-2">
                  <span className="sr-only">Details</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="px-4 py-10 text-center"
                    colSpan={columns.length + 1}
                  >
                    <p className="font-medium text-foreground">
                      {report.emptyTitle}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {report.emptyDescription}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <ReportResultRow
                    columns={columns}
                    isLast={index === rows.length - 1}
                    key={row.id}
                    onOpen={() => setActiveRow(row)}
                    report={report}
                    row={row}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <ReportRowDetails
        onClose={() => setActiveRow(null)}
        report={report}
        row={activeRow}
        viewQuery={viewQuery}
      />
    </>
  );
}

function ReportResultRow({
  columns,
  isLast,
  onOpen,
  report,
  row,
}: {
  columns: DisplayColumn[];
  isLast: boolean;
  onOpen: () => void;
  report: TrustedReport;
  row: TrustedReportRow;
}) {
  return (
    <TableRow
      className={cn(
        "align-middle hover:bg-muted/45",
        !isLast && "border-b border-border",
      )}
      data-tone={row.tone}
    >
      {columns.map((column) => (
        <TableCell
          className={cn(
            "px-3 py-2.5 leading-5 text-muted-foreground",
            column.align === "right" &&
              "text-right font-medium tabular-nums text-foreground",
          )}
          key={column.key}
        >
          {column.type === "scope" ? (
            <ScopeCell report={report} row={row} />
          ) : column.type === "owner-expenses" ? (
            <div className="text-right tabular-nums">
              <p className="font-medium text-foreground">
                {row.cells.managementFees || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                + {row.cells.propertyCosts || "—"} costs
              </p>
            </div>
          ) : (
            row.cells[column.key] || "—"
          )}
        </TableCell>
      ))}
      <TableCell className="px-2 py-2 text-right">
        <Button
          aria-label={`View details for ${row.title}`}
          onClick={onOpen}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ScopeCell({
  report,
  row,
}: {
  report: TrustedReport;
  row: TrustedReportRow;
}) {
  const primary =
    report.kind === "unit-profit-loss" ? row.cells.unit : row.cells.property;
  const secondary =
    report.kind === "unit-profit-loss" ? row.cells.property : row.cells.owner;

  return (
    <div className="min-w-0">
      {row.href ? (
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={row.href}
        >
          {primary || row.title}
        </Link>
      ) : (
        <p className="font-medium text-foreground">{primary || row.title}</p>
      )}
      {secondary ? (
        <p className="truncate text-xs text-muted-foreground">{secondary}</p>
      ) : null}
    </div>
  );
}

function ReportRowDetails({
  onClose,
  report,
  row,
  viewQuery,
}: {
  onClose: () => void;
  report: TrustedReport;
  row: TrustedReportRow | null;
  viewQuery: ReportsViewQuery;
}) {
  if (!row) return null;

  const hiddenSourceCount = Math.max(
    0,
    row.sourceCount - row.sourceLinks.length,
  );
  const unitPdfHref =
    report.kind === "unit-profit-loss" && row.cells.unit !== "Property-level"
      ? buildUnitExportHref("/api/reports/pdf", viewQuery, row.id)
      : null;
  const unitExcelHref =
    report.kind === "unit-profit-loss" && row.cells.unit !== "Property-level"
      ? buildUnitExportHref("/api/reports/excel", viewQuery, row.id)
      : null;

  return (
    <SideDrawer
      description={report.periodLabel}
      footer={
        <>
          {unitPdfHref ? (
            <Button asChild size="sm" variant="outline">
              <a aria-label="Export this unit as PDF" href={unitPdfHref}>
                <Download aria-hidden="true" />
                Export PDF
              </a>
            </Button>
          ) : null}
          {unitExcelHref ? (
            <Button asChild size="sm" variant="outline">
              <a aria-label="Export this unit as Excel" href={unitExcelHref}>
                Export Excel
              </a>
            </Button>
          ) : null}
          {row.href ? (
            <Button asChild size="sm">
              <Link href={row.href}>Open record</Link>
            </Button>
          ) : null}
        </>
      }
      onClose={onClose}
      open
      size="preview"
      title={row.title}
    >
      <div className="space-y-6 px-5 pb-6">
        <dl className="divide-y divide-border border-y border-border">
          {report.columns.map((column) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2.5"
              key={column.key}
            >
              <dt className="text-muted-foreground">{column.label}</dt>
              <dd className="max-w-72 text-right font-medium tabular-nums text-foreground">
                {row.cells[column.key] || "—"}
              </dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="report-row-sources">
          <h3 className="font-semibold text-foreground" id="report-row-sources">
            Source records
          </h3>
          {row.sourceLinks.length === 0 ? (
            <p className="mt-2 text-muted-foreground">{row.sourceSummary}</p>
          ) : (
            <div className="mt-2 divide-y divide-border border-y border-border">
              {row.sourceLinks.map((source) =>
                source.href ? (
                  <Link
                    className="flex min-h-10 items-center justify-between gap-3 py-2 font-medium text-foreground hover:underline"
                    href={source.href}
                    key={`${source.recordType}:${source.id}`}
                  >
                    <span>{source.label}</span>
                    <ChevronRight aria-hidden="true" size={15} />
                  </Link>
                ) : (
                  <div
                    className="flex min-h-10 items-center py-2 text-foreground"
                    key={`${source.recordType}:${source.id}`}
                  >
                    {source.label}
                  </div>
                ),
              )}
            </div>
          )}
          {hiddenSourceCount > 0 ? (
            <p
              aria-label={`${row.sourceSummary}; ${hiddenSourceCount} additional source${hiddenSourceCount === 1 ? " is" : "s are"} available in PDF and Excel exports`}
              className="mt-2 text-xs text-muted-foreground"
            >
              +{hiddenSourceCount} more
            </p>
          ) : null}
        </section>
      </div>
    </SideDrawer>
  );
}

function displayColumns(report: TrustedReport): DisplayColumn[] {
  if (report.kind === "unit-profit-loss") {
    return [
      { key: "scope", label: "Property / unit", type: "scope" },
      { align: "right", key: "income", label: "Income", type: "value" },
      { align: "right", key: "expenses", label: "Expenses", type: "value" },
      {
        align: "right",
        key: "netIncome",
        label: "Net income",
        type: "value",
      },
    ];
  }

  if (report.kind === "monthly-owner-activity") {
    return [
      { key: "scope", label: "Property / owner", type: "scope" },
      { align: "right", key: "rent", label: "Rent", type: "value" },
      {
        align: "right",
        key: "expenses",
        label: "Expenses",
        type: "owner-expenses",
      },
      {
        align: "right",
        key: "withdrawals",
        label: "Distributed",
        type: "value",
      },
      {
        align: "right",
        key: "netChange",
        label: "Net",
        type: "value",
      },
    ];
  }

  return [
    { key: "scope", label: "Record", type: "scope" },
    ...report.columns.slice(1).map((column) => ({
      ...column,
      type: "value" as const,
    })),
  ];
}

function hasFinancialActivity(row: TrustedReportRow) {
  return [row.cells.income, row.cells.expenses, row.cells.netIncome].some(
    (value) => numericValue(value) !== 0,
  );
}

function numericValue(value?: string) {
  if (!value) return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildUnitExportHref(
  path: string,
  viewQuery: ReportsViewQuery,
  unitId: string,
) {
  const params = new URLSearchParams({
    report: "unit-profit-loss",
    month: viewQuery.month,
    unitId,
  });
  if (viewQuery.propertyId !== "all") {
    params.set("propertyId", viewQuery.propertyId);
  }
  return `${path}?${params.toString()}`;
}
