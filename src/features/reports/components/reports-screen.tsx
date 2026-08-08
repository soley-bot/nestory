import Link from "next/link";
import { AlertTriangle, ChevronDown, Download } from "lucide-react";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportsFilters } from "@/features/reports/components/reports-filters";
import {
  buildReportBuilderHref,
  getReportCatalogItem,
  reportCatalog,
} from "@/features/reports/report-catalog";
import type {
  ReportsScreenData,
  ReportsViewQuery,
  TrustedReport,
  TrustedReportRow,
} from "@/features/reports/reports.types";
import { cn } from "@/lib/utils";

type ReportsScreenProps = ReportsScreenData & {
  organizationName: string;
};

export function ReportBuilderScreen({
  propertyOptions,
  trustedReport,
  unitOptions,
  viewQuery,
}: ReportsScreenProps) {
  const selectedReport = getReportCatalogItem(viewQuery.report);
  const validation =
    trustedReport.scopeValidation ?? trustedReport.exportValidation;
  const visibleSummary = trustedReport.summary.slice(0, 4);
  const reportRowCount =
    trustedReport.totalRowCount ?? trustedReport.rows.length;
  const showRecords = trustedReport.kind !== "monthly-owner-activity";

  return (
    <WorkspacePage
      context={`${trustedReport.scopeLabel} · ${trustedReport.periodLabel}`}
      contextHref={`/reports/${viewQuery.report}`}
      localNav={<ReportTabs viewQuery={viewQuery} />}
      title={selectedReport.title}
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        <ReportsFilters
          action={`/reports/${viewQuery.report}`}
          actions={
            validation ? undefined : <ExportMenu viewQuery={viewQuery} />
          }
          propertyOptions={propertyOptions}
          unitOptions={unitOptions}
          viewQuery={viewQuery}
        />

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          {validation ? (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
                trustedReport.scopeValidation
                  ? "border-danger/30 bg-danger/5 text-danger"
                  : "border-warning/30 bg-warning-soft/35 text-foreground",
              )}
              role={trustedReport.scopeValidation ? "alert" : "status"}
            >
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              <div>
                <p className="font-semibold">
                  {trustedReport.scopeValidation
                    ? "Report unavailable"
                    : "Export unavailable"}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {validation.message}
                </p>
              </div>
            </div>
          ) : null}

          {visibleSummary.length > 0 && !trustedReport.scopeValidation ? (
            <section
              aria-label="Report totals"
              className="overflow-hidden rounded-md border border-border bg-card"
              role="region"
            >
              <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                {visibleSummary.map((metric) => (
                  <div className="min-w-0 px-3 py-2.5" key={metric.label}>
                    <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                      {metric.label}
                    </dt>
                    <dd className="mt-0.5 truncate text-base font-semibold tabular-nums text-foreground">
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section
            className="overflow-hidden rounded-md border border-border bg-card"
            data-slot="report-table-frame"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border px-3 py-2.5">
              <h2 className="min-w-0 text-sm font-semibold text-foreground">
                {trustedReport.title}
              </h2>
              <p className="whitespace-nowrap text-xs text-muted-foreground">
                {reportRowCount} {reportRowCount === 1 ? "row" : "rows"}
                {reportRowCount > trustedReport.rows.length
                  ? ` · showing ${trustedReport.rows.length}`
                  : ""}
              </p>
            </div>

            <div
              aria-label={`${trustedReport.title} table`}
              className="max-w-full overflow-auto"
              role="region"
              tabIndex={0}
            >
              <Table
                aria-label={trustedReport.title}
                className="min-w-[680px] text-[13px]"
              >
                <TableHeader className="bg-muted/50 text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
                  <TableRow>
                    {trustedReport.columns.map((column) => (
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
                    {showRecords ? (
                      <TableHead className="h-9 px-3 font-semibold text-muted-foreground">
                        Records
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trustedReport.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        className="px-4 py-10 text-center"
                        colSpan={Math.max(
                          1,
                          trustedReport.columns.length + (showRecords ? 1 : 0),
                        )}
                      >
                        <p className="font-medium text-foreground">
                          {trustedReport.emptyTitle}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {trustedReport.emptyDescription}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    trustedReport.rows.map((row, index) => (
                      <ReportRow
                        columns={trustedReport.columns}
                        isLast={index === trustedReport.rows.length - 1}
                        key={row.id}
                        row={row}
                        showRecords={showRecords}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </div>
    </WorkspacePage>
  );
}

function ReportTabs({ viewQuery }: { viewQuery: ReportsViewQuery }) {
  return (
    <nav aria-label="Reports" className="overflow-x-auto px-4 py-1.5 sm:px-6">
      <div className="flex min-w-max items-center gap-1">
        {reportCatalog.map((report) => (
          <Link
            aria-current={viewQuery.report === report.kind ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              viewQuery.report === report.kind
                ? "bg-muted text-foreground"
                : "text-muted-foreground",
            )}
            href={reportTabHref(report.kind, viewQuery)}
            key={report.kind}
          >
            {report.tabLabel}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function ExportMenu({ viewQuery }: { viewQuery: ReportsViewQuery }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Download />
          Export
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem asChild>
          <a href={buildExportHref("/api/reports/pdf", viewQuery)}>PDF</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildExportHref("/api/reports/excel", viewQuery)}>Excel</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReportRow({
  columns,
  isLast,
  row,
  showRecords,
}: {
  columns: TrustedReport["columns"];
  isLast: boolean;
  row: TrustedReportRow;
  showRecords: boolean;
}) {
  const hiddenSourceCount = Math.max(
    0,
    row.sourceCount - row.sourceLinks.length,
  );

  return (
    <TableRow
      className={cn(
        "align-top hover:bg-muted/60",
        !isLast && "border-b border-border",
      )}
      data-tone={row.tone}
    >
      {columns.map((column, index) => {
        const value = row.cells[column.key] || "—";
        return (
          <TableCell
            className={cn(
              "px-3 py-2.5 leading-5 text-muted-foreground",
              column.align === "right" &&
                "text-right font-medium tabular-nums text-foreground",
            )}
            key={column.key}
          >
            {index === 0 && row.href ? (
              <Link
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={row.href}
              >
                {value}
              </Link>
            ) : (
              value
            )}
          </TableCell>
        );
      })}
      {showRecords ? (
        <TableCell className="px-3 py-2.5 leading-5 text-muted-foreground">
          {row.sourceLinks.length === 0 && hiddenSourceCount === 0 ? (
            "—"
          ) : (
            <div className="flex max-w-72 flex-wrap gap-x-2 gap-y-1">
              {row.sourceLinks.map((source) =>
                source.href ? (
                  <Link
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    href={source.href}
                    key={`${source.recordType}:${source.id}`}
                  >
                    {source.label}
                  </Link>
                ) : (
                  <span key={`${source.recordType}:${source.id}`}>
                    {source.label}
                  </span>
                ),
              )}
              {hiddenSourceCount > 0 ? (
                <span
                  aria-label={`${row.sourceSummary}; ${hiddenSourceCount} additional source${hiddenSourceCount === 1 ? " is" : "s are"} available in PDF and Excel exports`}
                  className="font-medium text-muted-foreground"
                  title={row.sourceSummary}
                >
                  +{hiddenSourceCount} more
                </span>
              ) : null}
            </div>
          )}
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function reportTabHref(
  report: (typeof reportCatalog)[number]["kind"],
  viewQuery: ReportsViewQuery,
) {
  const params = new URLSearchParams({ month: viewQuery.month });
  if (viewQuery.propertyId !== "all") {
    params.set("propertyId", viewQuery.propertyId);
  }
  if (report === "unit-profit-loss" && viewQuery.unitId !== "all") {
    params.set("unitId", viewQuery.unitId);
  }
  return buildReportBuilderHref(report, params);
}

function buildExportHref(path: string, viewQuery: ReportsViewQuery) {
  const params = new URLSearchParams({
    report: viewQuery.report,
    month: viewQuery.month,
  });
  if (viewQuery.propertyId !== "all") {
    params.set("propertyId", viewQuery.propertyId);
  }
  if (viewQuery.report === "unit-profit-loss" && viewQuery.unitId !== "all") {
    params.set("unitId", viewQuery.unitId);
  }
  return `${path}?${params.toString()}`;
}
