import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  FileText,
  Layers,
  PackageCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/features/reports/components/print-button";
import { ReportsFilters } from "@/features/reports/components/reports-filters";
import { formatLongReportDate } from "@/features/reports/data/report-format";
import {
  buildReportBuilderHref,
  getReportCatalogItem,
  getReportPackets,
  reportCatalog,
  reportCategories,
  type ReportCatalogItem,
  type ReportPacket,
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

export function ReportsLibraryScreen({
  viewQuery,
}: {
  viewQuery: ReportsViewQuery;
}) {
  const packets = getReportPackets({
    month: viewQuery.month,
    propertyId: viewQuery.propertyId,
  });

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        description="Choose a report, then build the scoped preview and export from its report builder."
        title="Reports"
      />
      <main className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-6">
        <section className="rounded-md border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Report library
              </h2>
              <p className="mt-1 text-xs text-muted">
                Pick the business question first. Builder controls live on the
                selected report page.
              </p>
            </div>
            <Badge className="px-2 text-xs" tone="neutral">
              {reportCatalog.length} reports
            </Badge>
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-2">
            {reportCategories.map((category) => (
              <div className="space-y-2" key={category}>
                <div className="flex items-center gap-2 px-1">
                  <Layers className="text-muted" size={14} />
                  <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                    {category}
                  </h3>
                </div>
                <div className="space-y-2">
                  {reportCatalog
                    .filter((report) => report.category === category)
                    .map((report) => (
                      <ReportCatalogCard
                        key={report.kind}
                        report={report}
                        viewQuery={viewQuery}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-3">
          <ReportPackets packets={packets} />
          <section className="rounded-md border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-foreground">
              What a report contains
            </h2>
            <div className="mt-3 space-y-3 text-[13px] leading-5 text-foreground-muted">
              <p>
                Each builder creates a scoped preview from live Nestory source
                records, then exports the same rows to CSV or PDF.
              </p>
              <p>
                PDF exports include the report purpose, scope, period, summary
                metrics, source trace, and the supporting table.
              </p>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

export function ReportBuilderScreen({
  organizationName,
  propertyOptions,
  trustedReport,
  viewQuery,
}: ReportsScreenProps) {
  const reportRowCount = trustedReport.totalRowCount ?? trustedReport.rows.length;
  const isPreviewLimited = reportRowCount > trustedReport.rows.length;
  const selectedReport = getReportCatalogItem(viewQuery.report);

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
          description={selectedReport.description}
          title={selectedReport.title}
        />
      </div>

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4 print:p-0">
        <Link
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground print:hidden"
          href="/reports"
          prefetch={false}
        >
          <ArrowLeft size={14} />
          Report library
        </Link>

        <section className="grid gap-4 print:hidden xl:grid-cols-[minmax(0,1fr)_360px]">
          <SelectedReportPanel
            report={selectedReport}
            trustedReport={trustedReport}
          />
          <ReportsFilters
            action={buildReportBuilderHref(viewQuery.report)}
            propertyOptions={propertyOptions}
            showReportSelect={false}
            viewQuery={viewQuery}
          />
        </section>

        <ReportSummaryGrid report={trustedReport} />
        <TrustedReportTable
          organizationName={organizationName}
          report={trustedReport}
        />
      </main>
    </div>
  );
}

function ReportCatalogCard({
  report,
  viewQuery,
}: {
  report: ReportCatalogItem;
  viewQuery: ReportsViewQuery;
}) {
  return (
    <Link
      className={cn(
        "block rounded-md border border-border bg-surface-muted/35 p-3 transition-colors",
        "hover:border-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
      )}
      href={buildCatalogCardHref(report.kind, viewQuery)}
      prefetch={false}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-foreground">
            {report.title}
          </h4>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-foreground-muted">
            {report.description}
          </p>
        </div>
        <ArrowRight className="mt-0.5 shrink-0 text-muted" size={15} />
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="font-medium text-muted">Best for</dt>
          <dd className="truncate text-foreground">{report.bestFor}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-medium text-muted">Sources</dt>
          <dd className="truncate text-foreground">{report.sources}</dd>
        </div>
      </dl>
    </Link>
  );
}

function SelectedReportPanel({
  report,
  trustedReport,
}: {
  report: ReportCatalogItem;
  trustedReport: TrustedReport;
}) {
  const totalRowCount = trustedReport.totalRowCount ?? trustedReport.rows.length;

  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-surface-muted">
          <FileText size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Report builder
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-foreground">
            {report.title}
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-foreground-muted">
            {trustedReport.description}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <ReportMeta label="Rows" value={String(totalRowCount)} />
        <ReportMeta label="Scope" value={trustedReport.scopeLabel} />
        <ReportMeta label="Period" value={trustedReport.periodLabel} />
      </dl>
    </section>
  );
}

function ReportPackets({ packets }: { packets: ReportPacket[] }) {
  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <PackageCheck className="text-muted" size={15} />
        <h2 className="text-sm font-semibold text-foreground">
          Report packets
        </h2>
      </div>
      <div className="space-y-2 p-3">
        {packets.map((packet) => (
          <Link
            className="block rounded-md border border-border bg-surface-muted/35 p-3 transition-colors hover:bg-surface-muted"
            href={packet.href}
            key={packet.title}
            prefetch={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {packet.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                  {packet.description}
                </p>
              </div>
              <Badge className="shrink-0 px-2 text-xs" tone="neutral">
                {packet.reports}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </section>
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

      <div className="max-h-[min(560px,calc(100vh-430px))] overflow-auto print:max-h-none print:overflow-visible">
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

  if (query.unitId !== "all") {
    params.set("unitId", query.unitId);
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

  if (query.unitId !== "all") {
    params.set("unitId", query.unitId);
  }

  if (query.status !== "all") {
    params.set("status", query.status);
  }

  return `/api/reports/pdf?${params.toString()}`;
}

function buildCatalogCardHref(
  report: ReportCatalogItem["kind"],
  viewQuery: ReportsViewQuery,
) {
  const query = new URLSearchParams({ month: viewQuery.month });

  if (viewQuery.propertyId !== "all") {
    query.set("propertyId", viewQuery.propertyId);
  }

  if (viewQuery.unitId !== "all") {
    query.set("unitId", viewQuery.unitId);
  }

  return buildReportBuilderHref(report, query);
}
