"use client";

import { withReportReturn } from "../report-return";
import { buildReportQueryParams } from "../reports.filters";
import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { ProfitLossUnitTransactions } from "./profit-loss-detail";
import { ReportPageNavigation, ReportScopeSearch, reportScreenHref } from "./report-page-navigation";
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
  report: inputReport,
  reportRowCount,
  viewQuery,
}: ReportResultsTableProps) {
  const origin = `/reports/${viewQuery.report}?${buildReportQueryParams(viewQuery).toString()}`;
  const report = { ...inputReport, rows: inputReport.rows.map(row => ({ ...row, href: row.href && /^\/(bills-expenses|rent-income)(\?|$)/.test(row.href) ? withReportReturn(row.href, origin) : row.href })) };
  const [activeRow, setActiveRow] = React.useState<TrustedReportRow | null>(
    null,
  );
  const isProfitLoss = report.kind === "unit-profit-loss";
  const zeroActivityCount = report.zeroActivityRowCount ?? 0;
  const query = viewQuery.scopeQuery ?? "";
  const rows = report.rows;
  const columns = displayColumns(report);
  const operational = ["transactions", "management-fees", "rent-roll", "rent-collections"].includes(report.kind);
  const countLabel =
    report.kind === "unit-profit-loss"
      ? `${reportRowCount} ${reportRowCount === 1 ? "scope" : "scopes"}`
      : report.kind === "monthly-owner-activity"
        ? `${reportRowCount} ${reportRowCount === 1 ? "property" : "properties"}`
        : `${reportRowCount} ${reportRowCount === 1 ? "record" : "records"}`;

  function pagination(label: string) {
    return report.screenPagination ? <ReportPageNavigation pagination={report.screenPagination} viewQuery={viewQuery} label={label} /> : null;
  }

  return (
    <>
      <section className="border-t border-border" data-slot="report-table-frame">
        <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border py-2">
          <h2 className="min-w-0 text-sm font-semibold text-foreground">
            {report.title}
          </h2>
          <span className="text-xs text-muted-foreground">{countLabel}</span>
          {zeroActivityCount > 0 ? (
            <Button
              asChild
              className="ml-auto h-7 px-2 text-xs"
              variant="ghost"
            >
              <Link prefetch={false} scroll={false} href={reportScreenHref(viewQuery, { showZeroActivity: !viewQuery.showZeroActivity, page: 1 })}>{viewQuery.showZeroActivity
                ? "Hide scopes with no activity"
                : `Show ${zeroActivityCount} ${zeroActivityCount === 1 ? "scope" : "scopes"} with no activity`}</Link>
            </Button>
          ) : null}
        </div>

        {isProfitLoss ? <ReportScopeSearch viewQuery={viewQuery} /> : null}
        {isProfitLoss ? pagination("Report pages, top") : null}
        <div
          aria-label={`${report.title} table`}
          className={cn("max-w-full", isProfitLoss ? "[&>[data-slot=table-container]]:max-h-[55vh]" : "overflow-x-auto")}
          role="region"
          tabIndex={0}
        >
          <Table scrollRegionLabel={isProfitLoss ? "Summary rows" : undefined} aria-label={report.title} className={cn("min-w-[600px] text-[13px] leading-5", operational && "table-fixed", operational && columns.length > 7 && "min-w-[1000px]")}>
            {operational ? <colgroup>{columns.map((column) => <col key={column.key} style={{ width: operationalColumnWidth(column.key, columns.length) }} />)}<col style={{ width: 42 }} /></colgroup> : null}
            <TableHeader sticky={isProfitLoss} className="bg-[var(--table-header-bg)] text-[11px] text-muted-foreground">
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    className={cn(
                      "h-9 px-3 font-medium text-muted-foreground",
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
                      {isProfitLoss && query ? "No matching property or unit" : report.emptyTitle}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isProfitLoss && query ? "Try a different search or show scopes with no activity. Report totals and exports still cover the full selected scope." : report.emptyDescription}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => row.isGroup ? <TableRow key={row.id} className="bg-muted/60">
                  <TableCell colSpan={columns.length + 1} className="px-3 py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
                      <span className="font-semibold">{row.title}</span>
                      <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>All matching rows</span>
                        {report.columns.filter((column) => column.numeric).map((column) => <span key={column.key}>{column.label}: <strong className="font-semibold tabular-nums text-foreground">{row.cells[column.key] || "—"}</strong></span>)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow> : (
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
        {pagination(isProfitLoss ? "Report pages, bottom" : "Report pages")}
      </section>

      <ReportRowDetails
        key={activeRow?.id}
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
            "px-3 py-2.5 leading-5 text-foreground",
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
            ["transactions", "management-fees", "rent-roll", "rent-collections"].includes(report.kind)
              ? <span className={column.align === "right" ? "block whitespace-nowrap" : "block whitespace-normal [overflow-wrap:anywhere]"}>{row.cells[column.key] || "—"}</span>
              : row.cells[column.key] || "—"
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
    <div className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
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
        <p className="whitespace-normal text-xs text-muted-foreground [overflow-wrap:anywhere]">{secondary}</p>
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
  const returnTo = `/reports/${viewQuery.report}?${buildReportQueryParams(viewQuery).toString()}`;

  // A paged report's detail lines are not the complete selected unit history.
  // Its drawer retains source previews and links to the scoped, paged P&L.
  const unitLines = report.kind === "unit-profit-loss" && !report.unitProfitLossScreen && !report.scopeValidation && report.unitProfitLossLines ? report.unitProfitLossLines.filter((line) => row.id.startsWith("property-level:") ? line.unitId === null && line.propertyId === row.id.slice("property-level:".length) : line.unitId === row.id) : null;
  const hiddenSourceCount = Math.max(
    0,
    row.sourceCount - row.sourceLinks.length,
  );
  const completeReportHref =
    report.kind === "unit-profit-loss"
      ? row.id.startsWith("property-level:")
        ? reportScreenHref(viewQuery, { propertyId: row.id.slice("property-level:".length), unitId: "all", scopeQuery: "Property-level", page: 1, detailPage: 1 })
        : buildUnitExportHref("/reports/unit-profit-loss", viewQuery, row.id)
      : null;

  return (
    <SideDrawer
      description={report.periodLabel}
      footer={
        <>
          {completeReportHref ? (
            <Button asChild size="sm" variant="outline">
              <Link href={completeReportHref} onClick={onClose}>Open complete P&amp;L</Link>
            </Button>
          ) : null}
          {row.href ? (
            <Button asChild size="sm">
              <Link href={withReportReturn(row.href, returnTo)}>Open record</Link>
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
        {completeReportHref ? <p className="text-sm text-muted-foreground">{row.id.startsWith("property-level:") ? "These totals cover property-level activity. Open the complete P&L to page through its transactions and export the combined property report." : "These totals cover this unit only. Open the complete P&L to review property-level costs and export the combined report."}</p> : null}
        <dl className="space-y-1">
          {(report.availableColumns ?? report.columns).map((column) => (
            <div
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-1 sm:gap-4 py-2.5 text-[13px] leading-5"
              key={column.key}
            >
              <dt className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{column.label}</dt>
              <dd className="min-w-0 whitespace-normal [overflow-wrap:anywhere] sm:text-right font-medium tabular-nums text-foreground">
                {row.cells[column.key] || "—"}
              </dd>
            </div>
          ))}
        </dl>

        {report.kind === "monthly-owner-activity" ? (
          <section aria-labelledby="owner-activity-reconciliation">
            <h3
              className="font-semibold text-foreground"
              id="owner-activity-reconciliation"
            >
              Net change calculation
            </h3>
            <p className="mt-2 text-sm tabular-nums text-muted-foreground">
              {row.cells.rent || "—"} − {row.cells.managementFees || "—"} −{" "}
              {row.cells.propertyCosts || "—"} − {row.cells.withdrawals || "—"}
              {" = "}{row.cells.netChange || "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Property costs include recorded cost corrections.
            </p>
          </section>
        ) : null}

        {unitLines ? <ProfitLossUnitTransactions returnTo={returnTo} lines={unitLines} /> : null}
        <section aria-labelledby="report-row-sources">
          <h3 className="font-semibold text-foreground" id="report-row-sources">
            Source records
          </h3>
          {row.sourceLinks.length === 0 ? (
            <p className="mt-2 text-muted-foreground">{row.sourceSummary}</p>
          ) : (
            <div className="mt-2 space-y-1">
              {row.sourceLinks.map((source) =>
                source.href ? (
                  <Link
                    className="flex min-h-10 items-center justify-between gap-3 py-2 font-medium text-foreground hover:underline"
                    href={/^\/(bills-expenses|rent-income)(\?|$)/.test(source.href) ? withReportReturn(source.href, returnTo) : source.href}
                    key={`${source.recordType}:${source.id}`}
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block">{source.label}</span>
                      {source.detail ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {source.detail}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight aria-hidden="true" size={15} />
                  </Link>
                ) : (
                  <div
                    className="flex min-h-10 items-center py-2 text-foreground"
                    key={`${source.recordType}:${source.id}`}
                  >
                    <span>
                      <span className="block">{source.label}</span>
                      {source.detail ? (
                        <span className="block text-xs text-muted-foreground">
                          {source.detail}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
          {hiddenSourceCount > 0 ? (
            <p
              aria-label={`${row.sourceSummary}; ${hiddenSourceCount} additional source${hiddenSourceCount === 1 ? " is" : "s are"} not shown in this preview`}
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
        label: "Net operating income",
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

  return report.columns.map((column) => ({
      ...column,
      type: "value" as const,
    }));
}

function operationalColumnWidth(key: string, columnCount: number): number | undefined {
  // Keep dense defaults readable; expanded column sets scroll within the table.
  if (["date", "dueDate", "leaseStart", "leaseEnd"].includes(key)) return 112;
  if (["type", "status"].includes(key)) return 130;
  if (["amount", "charges", "received", "outstanding", "credit", "rent", "fees"].includes(key)) return 132;
  if (key === "unit") return 90;
  return columnCount > 7 ? 155 : undefined;
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
