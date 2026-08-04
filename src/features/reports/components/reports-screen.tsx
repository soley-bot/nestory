import Link from "next/link";
import { AlertTriangle, ChevronDown, Download } from "lucide-react";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { FinanceWorkspaceNavigation } from "@/features/finance/components/finance-workspace-navigation";
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
  const showRecords = trustedReport.kind !== "owner-activity";

  return (
    <WorkspacePage
      actions={validation ? undefined : <ExportMenu viewQuery={viewQuery} />}
      context={`${trustedReport.scopeLabel} · ${trustedReport.periodLabel}`}
      contextHref={`/reports/${viewQuery.report}`}
      localNav={<FinanceWorkspaceNavigation activeRoute="/reports" />}
      title={selectedReport.title}
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        <ReportTabs viewQuery={viewQuery} />

        <ReportsFilters
          action={`/reports/${viewQuery.report}`}
          propertyOptions={propertyOptions}
          unitOptions={unitOptions}
          viewQuery={viewQuery}
        />

        <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
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
              <p className="mt-0.5 text-foreground-muted">
                {validation.message}
              </p>
            </div>
          </div>
        ) : null}

        {visibleSummary.length > 0 && !trustedReport.scopeValidation ? (
          <section
            aria-label="Report totals"
            className="overflow-hidden border-y border-border bg-surface"
            role="region"
          >
            <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
              {visibleSummary.map((metric) => (
                <div className="min-w-0 px-3 py-2.5" key={metric.label}>
                  <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
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
          className="overflow-hidden bg-surface"
          data-slot="report-table-frame"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {trustedReport.title}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {reportRowCount} {reportRowCount === 1 ? "row" : "rows"}
                {reportRowCount > trustedReport.rows.length
                  ? ` · showing ${trustedReport.rows.length}`
                  : ""}
              </p>
            </div>
          </div>

          <div
            aria-label={`${trustedReport.title} table`}
            className="max-w-full overflow-auto"
            role="region"
            tabIndex={0}
          >
            <table
              aria-label={trustedReport.title}
              className="w-full min-w-[680px] border-collapse text-left text-[13px]"
            >
              <thead className="bg-surface-muted text-[11px] uppercase tracking-[0.02em] text-muted">
                <tr>
                  {trustedReport.columns.map((column) => (
                    <th
                      className={cn(
                        "border-b border-border px-3 py-2 font-semibold",
                        column.align === "right" && "text-right",
                      )}
                      key={column.key}
                    >
                      {column.label}
                    </th>
                  ))}
                  {showRecords ? (
                    <th className="border-b border-border px-3 py-2 font-semibold">
                      Records
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {trustedReport.rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center"
                      colSpan={Math.max(
                        1,
                        trustedReport.columns.length + (showRecords ? 1 : 0),
                      )}
                    >
                      <p className="font-medium text-foreground">
                        {trustedReport.emptyTitle}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {trustedReport.emptyDescription}
                      </p>
                    </td>
                  </tr>
                ) : (
                  trustedReport.rows.map((row) => (
                    <ReportRow
                      columns={trustedReport.columns}
                      key={row.id}
                      row={row}
                      showRecords={showRecords}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        </main>
      </div>
    </WorkspacePage>
  );
}

function ReportTabs({ viewQuery }: { viewQuery: ReportsViewQuery }) {
  return (
    <nav
      aria-label="Reports"
      className="overflow-x-auto border-b border-border bg-surface px-4 py-1.5 sm:px-6"
    >
      <div className="flex min-w-max items-center gap-1">
        {reportCatalog.map((report) => (
          <Link
            aria-current={viewQuery.report === report.kind ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
              viewQuery.report === report.kind
                ? "bg-accent-soft text-foreground"
                : "text-foreground-muted",
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
    <details className="group relative">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden">
        <Download size={14} />
        Export
        <ChevronDown
          className="transition-transform group-open:rotate-180"
          size={14}
        />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-md border border-border bg-surface p-1 shadow-lg">
        <a
          className="block rounded px-2.5 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
          href={buildExportHref("/api/reports/pdf", viewQuery)}
        >
          PDF
        </a>
        <a
          className="block rounded px-2.5 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
          href={buildExportHref("/api/reports/excel", viewQuery)}
        >
          Excel
        </a>
      </div>
    </details>
  );
}

function ReportRow({
  columns,
  row,
  showRecords,
}: {
  columns: TrustedReport["columns"];
  row: TrustedReportRow;
  showRecords: boolean;
}) {
  const hiddenSourceCount = Math.max(
    0,
    row.sourceCount - row.sourceLinks.length,
  );

  return (
    <tr className="align-top hover:bg-surface-muted/60" data-tone={row.tone}>
      {columns.map((column, index) => {
        const value = row.cells[column.key] || "—";
        return (
          <td
            className={cn(
              "border-b border-border px-3 py-2.5 leading-5 text-foreground-muted last:border-b-0",
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
          </td>
        );
      })}
      {showRecords ? (
        <td className="border-b border-border px-3 py-2.5 leading-5 text-foreground-muted last:border-b-0">
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
                  className="font-medium text-muted"
                  title={row.sourceSummary}
                >
                  +{hiddenSourceCount} more
                </span>
              ) : null}
            </div>
          )}
        </td>
      ) : null}
    </tr>
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
