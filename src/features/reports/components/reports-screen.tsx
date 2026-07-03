import Link from "next/link";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsFilters } from "@/features/reports/components/reports-filters";
import { PrintButton } from "@/features/reports/components/print-button";
import { formatLongReportDate } from "@/features/reports/data/report-format";
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

export function ReportsScreen({
  organizationName,
  propertyOptions,
  trustedReport,
  viewQuery,
}: ReportsScreenProps) {
  const reportRowCount = trustedReport.totalRowCount ?? trustedReport.rows.length;
  const isPreviewLimited = reportRowCount > trustedReport.rows.length;

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="print:hidden">
        <PageHeader
          actions={
            <>
              <a
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-foreground bg-foreground px-2.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
                href={buildPdfHref(viewQuery)}
              >
                <Download size={14} />
                Download PDF
              </a>
              <a
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
                href={buildCsvHref(viewQuery)}
              >
                <Download size={14} />
                Export CSV
              </a>
              {isPreviewLimited ? null : <PrintButton />}
            </>
          }
          description="Connected reports built from Unit, Property, Lease, Ledger, Timeline, and Document source rows."
          title="Reports"
        />
      </div>

      <ReportsFilters propertyOptions={propertyOptions} viewQuery={viewQuery} />

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4 print:p-0">
        <ReportSummaryGrid report={trustedReport} />
        <TrustedReportTable
          organizationName={organizationName}
          report={trustedReport}
        />
      </main>
    </div>
  );
}

function ReportSummaryGrid({ report }: { report: TrustedReport }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 print:hidden">
      {report.summary.map((metric) => (
        <div
          className="rounded-md border border-border bg-surface px-3 py-2"
          key={metric.label}
          title={`${metric.detail}. Source count: ${metric.sourceCount}`}
        >
          <p className="text-xs font-medium text-foreground-muted">
            {metric.label}
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            {metric.value}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted">
            {metric.sourceCount} source rows
          </p>
        </div>
      ))}
    </div>
  );
}

function TrustedReportTable({
  organizationName,
  report,
}: {
  organizationName: string;
  report: TrustedReport;
}) {
  const totalRowCount = report.totalRowCount ?? report.rows.length;
  const isPreviewLimited = totalRowCount > report.rows.length;

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface shadow-sm print:rounded-none print:border-0 print:bg-white print:shadow-none">
      <div className="relative border-b border-border px-4 py-4 sm:px-5 print:block print:border-0 print:px-0 print:pb-3 print:pt-0 print:text-center">
        <div className="absolute inset-y-0 left-0 hidden w-1 bg-accent sm:block print:hidden" />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 print:block">
              <FileText className="text-accent print:hidden" size={17} />
              <h2 className="text-base font-semibold text-foreground print:text-[18px] print:text-black">
                {report.title} - {organizationName}
              </h2>
            </div>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-foreground-muted sm:text-[13px] print:text-[12px] print:text-black">
              {report.description}
            </p>
            <p className="mt-1 text-xs text-muted print:text-black">
              Generated {formatLongReportDate(report.generatedAt)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px] sm:min-w-[420px] sm:grid-cols-3 print:hidden">
            <ReportMeta label="Scope" value={report.scopeLabel} />
            <ReportMeta label="Period" value={report.periodLabel} />
            <ReportMeta label="Rows" value={String(totalRowCount)} />
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-surface-muted/60 px-4 py-2.5 text-[13px] text-foreground-muted print:hidden">
        {isPreviewLimited
          ? `Showing first ${report.rows.length} of ${totalRowCount} rows. Export CSV for the full report.`
          : report.totalsTraceLabel}
      </div>

      <div className="max-h-[320px] overflow-auto sm:max-h-[min(560px,calc(100vh-430px))] print:max-h-none print:overflow-visible">
        <table
          aria-label={`${report.title} report`}
          className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-[13px] print:min-w-0 print:border print:border-black print:text-[10px] print:text-black print:[&_td]:border print:[&_td]:border-black print:[&_td]:px-1.5 print:[&_td]:py-1.5 print:[&_th]:border print:[&_th]:border-black print:[&_th]:px-1.5 print:[&_th]:py-1 print:[&_thead_tr]:bg-white"
        >
          <thead className="sticky top-0 z-10 print:static">
            <tr className="bg-surface-muted text-[11px] font-semibold text-foreground-muted">
              <th className="border-b border-border px-3 py-2">Record</th>
              {report.columns.map((column) => (
                <th
                  className={cn(
                    "border-b border-border px-3 py-2",
                    column.align === "right" && "text-right",
                  )}
                  key={column.key}
                >
                  {column.label}
                </th>
              ))}
              <th className="border-b border-border px-3 py-2">Sources</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-muted"
                  colSpan={report.columns.length + 2}
                >
                  <strong className="block text-foreground">
                    {report.emptyTitle}
                  </strong>
                  <span className="mt-1 block">{report.emptyDescription}</span>
                </td>
              </tr>
            ) : (
              report.rows.map((row) => (
                <TrustedReportTableRow
                  columns={report.columns}
                  key={row.id}
                  row={row}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrustedReportTableRow({
  columns,
  row,
}: {
  columns: TrustedReport["columns"];
  row: TrustedReportRow;
}) {
  const primarySource = row.sourceLinks[0];
  const hiddenSourceCount = row.sourceCount - (primarySource ? 1 : 0);

  return (
    <tr className="align-top hover:bg-surface-muted/70 print:break-inside-avoid print:hover:bg-white">
      <td className="w-[220px] border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <ReportToneBadge tone={row.tone} />
          <div className="min-w-0">
            {row.href ? (
              <Link
                className="inline-flex max-w-full items-center gap-1 font-medium text-accent hover:text-accent-strong"
                href={row.href}
                prefetch={false}
              >
                <span className="truncate">{row.title}</span>
                <ExternalLink className="shrink-0" size={12} />
              </Link>
            ) : (
              <span className="font-medium text-foreground">{row.title}</span>
            )}
          </div>
        </div>
      </td>
      {columns.map((column) => (
        <td
          className={cn(
            "border-b border-border px-3 py-2.5 leading-5",
            column.align === "right"
              ? "text-right font-medium tabular-nums"
              : "text-foreground-muted",
          )}
          key={column.key}
        >
          {row.cells[column.key] ?? "-"}
        </td>
      ))}
      <td className="w-[150px] border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {primarySource?.href ? (
            <Link
              className="inline-flex min-h-6 max-w-[94px] items-center rounded-md border border-border bg-surface-muted px-2 text-xs font-medium text-foreground-muted hover:text-foreground"
              href={primarySource.href}
              prefetch={false}
              title={`${primarySource.recordType}: ${primarySource.label}`}
            >
              <span className="truncate">{primarySource.recordType}</span>
            </Link>
          ) : primarySource ? (
            <span
              className="inline-flex min-h-6 max-w-[94px] items-center rounded-md border border-border bg-surface-muted px-2 text-xs font-medium text-foreground-muted"
              title={`${primarySource.recordType}: ${primarySource.label}`}
            >
              <span className="truncate">{primarySource.recordType}</span>
            </span>
          ) : null}
          <span
            className="inline-flex min-h-6 items-center rounded-md border border-border bg-surface px-2 text-xs font-medium text-muted"
            title={row.sourceSummary}
          >
            {hiddenSourceCount > 0 ? `+${hiddenSourceCount}` : row.sourceCount}
          </span>
        </div>
      </td>
    </tr>
  );
}

function ReportToneBadge({ tone }: { tone?: TrustedReportRow["tone"] }) {
  if (!tone || tone === "neutral") {
    return null;
  }

  return (
    <Badge
      className="mt-0.5 shrink-0 capitalize print:hidden"
      tone={
        tone === "danger" ? "danger" : tone === "success" ? "success" : "warning"
      }
    >
      {tone}
    </Badge>
  );
}

function ReportMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-muted/70 px-2.5 py-2">
      <p className="text-[11px] font-medium text-foreground-muted">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-foreground">{value}</p>
    </div>
  );
}

function buildCsvHref(query: ReportsViewQuery) {
  const params = new URLSearchParams();

  params.set("report", query.report);
  params.set("month", query.month);

  if (query.propertyId !== "all") {
    params.set("propertyId", query.propertyId);
  }

  if (query.status !== "all") {
    params.set("status", query.status);
  }

  return `/api/reports/export?${params.toString()}`;
}

function buildPdfHref(query: ReportsViewQuery) {
  const params = new URLSearchParams();

  params.set("report", query.report);
  params.set("month", query.month);

  if (query.propertyId !== "all") {
    params.set("propertyId", query.propertyId);
  }

  if (query.status !== "all") {
    params.set("status", query.status);
  }

  return `/api/reports/pdf?${params.toString()}`;
}
