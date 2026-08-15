import { AlertTriangle, ChevronDown, Download } from "lucide-react";

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
import { getReportCatalogItem } from "@/features/reports/report-catalog";
import type {
  ReportsScreenData,
  ReportsViewQuery,
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
  const visibleSummary = trustedReport.summary
    .filter(
      (metric) =>
        trustedReport.kind !== "unit-profit-loss" || metric.label !== "Units",
    )
    .slice(0, trustedReport.kind === "unit-profit-loss" ? 3 : 4);
  const reportRowCount =
    trustedReport.totalRowCount ?? trustedReport.rows.length;

  return (
    <WorkspacePage
      actions={validation ? undefined : <ExportMenu viewQuery={viewQuery} />}
      title={selectedReport.title}
    >
      <div className="flex min-w-0 flex-col bg-background">
        <ReportsFilters
          action={`/reports/${viewQuery.report}`}
          propertyOptions={propertyOptions}
          unitOptions={unitOptions}
          viewQuery={viewQuery}
        />

        <div className="workspace-gutter-x flex-1 space-y-4 py-4">
          <p className="text-xs text-muted-foreground">
            {trustedReport.scopeLabel} · {trustedReport.periodLabel}
          </p>

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
                    <dt className="truncate text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
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
          <a href={buildExportHref("/api/reports/pdf", viewQuery)}>PDF</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildExportHref("/api/reports/excel", viewQuery)}>Excel</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
