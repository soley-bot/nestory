import { AlertTriangle, ChevronDown, Download } from "lucide-react";
import Link from "next/link";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReportResultsTable } from "@/features/reports/components/report-results-table";
import { ReportsFilters } from "@/features/reports/components/reports-filters";
import { getReportCatalogItem, reportCatalog } from "@/features/reports/report-catalog";
import { buildReportQueryParams } from "@/features/reports/reports.filters";
import { ReportSavedViews } from "@/features/reports/components/report-saved-views";
import { ReportColumns } from "@/features/reports/components/report-columns";
import type {
  ReportsScreenData,
  ReportsViewQuery,
} from "@/features/reports/reports.types";
import { cn } from "@/lib/utils";
import { RecheckReport } from "@/features/reports/components/report-remediation-controls";

type ReportsScreenProps = ReportsScreenData & {
  organizationName: string;
  viewStorageKey?: string;
};

export function ReportBuilderScreen({
  ownerOptions = [],
  propertyOptions,
  trustedReport,
  unitOptions,
  viewQuery,
  viewStorageKey,
}: ReportsScreenProps) {
  const selectedReport = getReportCatalogItem(viewQuery.report);
  const validation =
    trustedReport.scopeValidation ?? trustedReport.exportValidation;
  const modern = ["transactions", "management-fees", "rent-roll", "rent-collections"].includes(viewQuery.report);
  const visibleSummary = trustedReport.summary
    .filter(
      (metric) =>
        trustedReport.kind !== "unit-profit-loss" || metric.label !== "Units",
    )
    .slice(0, modern ? undefined : trustedReport.kind === "unit-profit-loss" ? 3 : 4);
  const reportRowCount =
    trustedReport.totalRowCount ?? trustedReport.rows.length;
  const queryKey = buildReportQueryParams(viewQuery).toString();

  return (
    <WorkspacePage
      actions={<div className="flex items-center gap-2"><RecheckReport />{validation ? null : <ExportMenu viewQuery={viewQuery} />}</div>}
      breadcrumbItems={[{ href: "/reports", label: "Reports" }]}
      title={selectedReport.title}
    >
      <div className="flex min-w-0 flex-col bg-background">
        <nav aria-label="Reports" className="workspace-gutter-x flex gap-1 overflow-x-auto border-b border-border py-2">
          {reportCatalog.map((report) => <Link key={report.kind} aria-current={report.kind === viewQuery.report ? "page" : undefined} href={`/reports/${report.kind}`} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", report.kind === viewQuery.report ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{report.tabLabel}</Link>)}
        </nav>
        <ReportsFilters
          key={queryKey}
          action={`/reports/${viewQuery.report}`}
          availableColumns={trustedReport.availableColumns ?? trustedReport.columns}
          filterOptions={trustedReport.filterOptions}
          ownerOptions={ownerOptions}
          propertyOptions={propertyOptions}
          unitOptions={unitOptions}
          viewQuery={viewQuery}
        />

        <div className="workspace-gutter-x flex-1 space-y-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{trustedReport.scopeLabel} · {trustedReport.periodLabel}</p>
            <div className="flex items-center gap-1">
              {modern && trustedReport.availableColumns?.length ? <ReportColumns key={queryKey} columns={trustedReport.availableColumns} selectedColumns={trustedReport.columns} viewQuery={viewQuery} /> : null}
              {viewStorageKey ? <ReportSavedViews key={`${viewStorageKey}:${viewQuery.report}`} storageKey={viewStorageKey} viewQuery={viewQuery} /> : null}
            </div>
          </div>
          {viewQuery.report === "rent-roll" ? <p className="text-xs text-muted-foreground">Current snapshot. Occupancy and rent reflect the current records, not a historical reconstruction.</p> : null}
          {viewQuery.report === "transactions" ? <p className="text-xs text-muted-foreground">Company receipts exclude amounts collected directly by owners.</p> : null}
          {viewQuery.report === "management-fees" ? <p className="text-xs text-muted-foreground">Fees charged to owners; not cash payments.</p> : null}
          {viewQuery.report === "rent-collections" ? <p className="text-xs text-muted-foreground">Rent invoices issued in this period, with payments and balances as of now.</p> : null}

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
              className="border-y border-border"
              role="region"
            >
              <dl
                className={cn(
                  "grid divide-y divide-border sm:divide-x sm:divide-y-0",
                  visibleSummary.length === 3
                    ? "sm:grid-cols-3"
                    : "sm:grid-cols-2 xl:grid-cols-4",
                )}
              >
                {visibleSummary.map((metric) => (
                  <div
                    className="min-w-0 py-3 sm:px-4 sm:first:pl-0"
                    key={metric.label}
                  >
                    <dt className="truncate text-xs font-medium text-muted-foreground">
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

          <ReportResultsTable
            key={queryKey}
            report={trustedReport}
            reportRowCount={reportRowCount}
            viewQuery={viewQuery}
          />
        </div>
      </div>
    </WorkspacePage>
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
          <a href={buildExportHref("/api/reports/pdf", viewQuery)}>PDF report</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildExportHref("/api/reports/excel", viewQuery)}>
            Excel workbook
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function buildExportHref(path: string, viewQuery: ReportsViewQuery) {
  const params = buildReportQueryParams(viewQuery);
  return `${path}?${params.toString()}`;
}
