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
import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PrintButton } from "@/features/reports/components/print-button";
import { ReportsFilters } from "@/features/reports/components/reports-filters";
import { formatLongReportDate } from "@/features/reports/data/report-format";
import { selectOwnerStatementRecipient } from "@/features/reports/data/owner-statement-report";
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
    <WorkspacePage
      context={`${reportCatalog.length} available reports`}
      contextHref="/reports"
      localNav={<ReportFamilyNavigation viewQuery={viewQuery} />}
      title="Reports"
    >
      <main className="grid h-full min-h-0 gap-4 overflow-y-auto px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-6">
        <section className="rounded-md border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Report library
            </h2>
            <Badge className="px-2 text-xs" tone="neutral">
              {reportCatalog.length} reports
            </Badge>
          </div>

          <div
            className="divide-y divide-border"
            data-report-picker="index"
          >
            {reportCategories.map((category) => (
              <section
                className="grid gap-2 px-3 py-3 sm:grid-cols-[120px_minmax(0,1fr)]"
                key={category}
              >
                <div className="flex items-center gap-2 self-start px-1 py-2">
                  <Layers className="text-muted" size={14} />
                  <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                    {category}
                  </h3>
                </div>
                <div className="divide-y divide-border/70 overflow-hidden rounded-md border border-border">
                  {reportCatalog
                    .filter((report) => report.category === category)
                    .map((report) => (
                      <ReportCatalogRow
                        key={report.kind}
                        report={report}
                        viewQuery={viewQuery}
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <aside className="space-y-3" aria-label="Report shortcuts">
          <ReportPackets packets={packets} />
        </aside>
      </main>
    </WorkspacePage>
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
  const isOwnerStatement = trustedReport.kind === "owner-statement";
  const isPreviewUnavailable = Boolean(trustedReport.scopeValidation);

  if (
    isOwnerStatement &&
    !trustedReport.scopeValidation &&
    (viewQuery.ownerPersonId !== "all" || viewQuery.ownerPersonIdInvalid)
  ) {
    const selection = selectOwnerStatementRecipient(trustedReport, viewQuery);
    if ("status" in selection) {
      return (
        <OwnerStatementValidationScreen
          message={selection.message}
          viewQuery={viewQuery}
        />
      );
    }

    return (
      <OwnerStatementRecipientScreen
        organizationName={organizationName}
        report={selection.report}
        row={selection.report.rows[0]}
        viewQuery={viewQuery}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="print:hidden">
        <PageHeader
          actions={
            trustedReport.scopeValidation ? undefined : (
              <div
                aria-label="Export report"
                className="flex flex-wrap items-center gap-2"
                data-report-stage="export"
                role="region"
              >
                {isOwnerStatement ? null : (
                  <a
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-foreground bg-foreground px-2.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
                    href={buildPdfHref(viewQuery)}
                  >
                    <Download size={14} />
                    Export PDF
                  </a>
                )}
                <a
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
                  href={buildCsvHref(viewQuery)}
                >
                  <Download size={14} />
                  Export CSV
                </a>
                {isOwnerStatement || isPreviewLimited ? null : <PrintButton />}
              </div>
            )
          }
          context={`${trustedReport.scopeLabel} · ${trustedReport.periodLabel}`}
          title={isOwnerStatement ? trustedReport.title : selectedReport.title}
        />
        <ReportFamilyNavigation
          activeCategory={selectedReport.category}
          viewQuery={viewQuery}
        />
      </div>

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4 print:p-0">
        <section
          className="grid gap-4 print:hidden lg:grid-cols-[minmax(0,1fr)_320px]"
          data-report-builder-layout="true"
        >
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

        <section
          aria-label={
            isPreviewUnavailable
              ? "Report preview unavailable"
              : "Report preview"
          }
          className="space-y-3"
          data-report-stage={isPreviewUnavailable ? "blocked" : "preview"}
          role="region"
        >
          <div
            className={cn(
              "flex items-center justify-between gap-3 border-y border-border bg-surface px-3 py-2 text-[13px] print:hidden",
              isPreviewUnavailable && "border-warning/30 bg-warning-soft/30",
            )}
            role={isPreviewUnavailable ? "alert" : "status"}
          >
            <p
              className={cn(
                "font-semibold text-foreground",
                isPreviewUnavailable && "text-warning",
              )}
            >
              {isPreviewUnavailable ? "Preview unavailable" : "Preview ready"}
            </p>
            <p className="truncate text-foreground-muted">
              {isPreviewUnavailable
                ? "Update the report scope to generate results"
                : `${reportRowCount} ${reportRowCount === 1 ? "row" : "rows"} · ${trustedReport.scopeLabel}`}
            </p>
          </div>
          {isPreviewUnavailable ? null : (
            <ReportSummaryGrid report={trustedReport} />
          )}
          <TrustedReportTable
            organizationName={organizationName}
            report={trustedReport}
            viewQuery={viewQuery}
          />
        </section>
      </main>
    </div>
  );
}

function OwnerStatementRecipientScreen({
  organizationName,
  report,
  row,
  viewQuery,
}: {
  organizationName: string;
  report: TrustedReport;
  row: TrustedReportRow;
  viewQuery: ReportsViewQuery;
}) {
  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="print:hidden">
        <PageHeader
          actions={
            <div
              aria-label="Export report"
              className="flex flex-wrap items-center gap-2"
              data-report-stage="export"
              role="region"
            >
              <a
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-foreground bg-foreground px-2.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
                href={buildPdfHref(viewQuery)}
              >
                <Download size={14} />
                Export PDF
              </a>
              <PrintButton autoPrint={viewQuery.print === true} />
            </div>
          }
          context={`${report.scopeLabel} · ${report.periodLabel}`}
          title="Owner Statement"
        />
        <ReportFamilyNavigation
          activeCategory="Finance"
          viewQuery={viewQuery}
        />
      </div>

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 print:p-0">
        <Link
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground print:hidden"
          href={buildOwnerStatementReadinessHref(viewQuery)}
          prefetch={false}
        >
          <ArrowLeft size={14} />
          Back to readiness
        </Link>

        <article className="mx-auto max-w-5xl overflow-hidden rounded-md border border-border bg-surface shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
          <header className="border-b border-border bg-surface-muted/45 px-5 py-5 print:bg-white print:px-0 print:pt-0">
            <p className="text-xs font-medium text-muted">{organizationName}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
              <OwnerStatementIdentity label="Owner" value={row.cells.owner ?? "-"} />
              <OwnerStatementIdentity label="Property" value={row.cells.property ?? "-"} />
              <OwnerStatementIdentity
                label="Ownership share"
                value={row.cells.ownership ?? "-"}
              />
            </div>
            <p className="mt-4 text-xs text-foreground-muted">
              Statement period: {report.periodLabel}
            </p>
          </header>

          <div className="space-y-6 px-5 py-5 print:px-0 print:pb-0">
            <OwnerStatementFactSection
              facts={[
                ["Operating cash received", "operatingCash"],
                ["Property expenses paid", "propertyExpenses"],
                ["Management fees received", "managementReceived"],
                ["Owner contributions", "ownerContributions"],
                ["Owner payouts", "ownerPayouts"],
                ["Net owner cash movement", "netMovement"],
              ]}
              row={row}
              title="Cash activity"
            />
            <OwnerStatementFactSection
              facts={[
                ["Management fees earned", "managementEarned"],
                [
                  "Management fees outstanding from this period",
                  "managementOutstanding",
                ],
                ["Security deposits held", "depositsHeld"],
              ]}
              row={row}
              title="Period disclosures"
            />
          </div>
        </article>
      </main>
    </div>
  );
}

function OwnerStatementValidationScreen({
  message,
  viewQuery,
}: {
  message: string;
  viewQuery: ReportsViewQuery;
}) {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        context="Owner statement recipient"
        title="Owner Statement"
      />
      <ReportFamilyNavigation
        activeCategory="Finance"
        viewQuery={viewQuery}
      />
      <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6">
        <Link
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          href={buildOwnerStatementReadinessHref(viewQuery)}
          prefetch={false}
        >
          <ArrowLeft size={14} />
          Back to readiness
        </Link>
        <section
          className="rounded-md border border-warning/40 bg-warning/5 px-4 py-4"
          role="alert"
        >
          <h2 className="text-sm font-semibold text-foreground">
            Statement cannot be generated
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-foreground-muted">
            {message}
          </p>
        </section>
      </main>
    </div>
  );
}

function OwnerStatementIdentity({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function OwnerStatementFactSection({
  facts,
  row,
  title,
}: {
  facts: Array<readonly [label: string, key: string]>;
  row: TrustedReportRow;
  title: string;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
        {title}
      </h2>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {facts.map(([label, key]) => (
          <div
            className="rounded-md border border-border px-3 py-3 print:break-inside-avoid"
            key={key}
          >
            <dt className="text-xs leading-4 text-foreground-muted">{label}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {row.cells[key] ?? "-"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OwnerStatementRowActions({
  row,
  viewQuery,
}: {
  row: TrustedReportRow;
  viewQuery: ReportsViewQuery;
}) {
  const recipientQuery = {
    ...viewQuery,
    ownerPersonId: row.ownerPersonId!,
    propertyId: row.propertyId!,
  };

  return (
    <div className="flex min-w-[190px] flex-wrap items-center justify-end gap-1.5 print:hidden">
      <Link
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
        href={buildOwnerStatementPreviewHref(recipientQuery)}
        prefetch={false}
      >
        Preview
      </Link>
      <a
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
        href={buildPdfHref(recipientQuery)}
      >
        PDF
      </a>
      <Link
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
        href={buildOwnerStatementPreviewHref(recipientQuery, true)}
        prefetch={false}
        target="_blank"
      >
        Print
      </Link>
    </div>
  );
}

function ReportCatalogRow({
  report,
  viewQuery,
}: {
  report: ReportCatalogItem;
  viewQuery: ReportsViewQuery;
}) {
  return (
    <Link
      aria-label={`Open ${report.title}`}
      className={cn(
        "group grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-surface px-3 py-2.5 transition-colors",
        "hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
      )}
      data-report-picker-item="true"
      href={buildCatalogCardHref(report.kind, viewQuery)}
      prefetch={false}
    >
      <div className="min-w-0 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.8fr)] sm:items-center sm:gap-4">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-foreground">
            {report.title}
          </h4>
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            {report.bestFor}
          </p>
        </div>
        <p className="mt-1 truncate text-xs text-muted sm:mt-0">
          {report.sources}
        </p>
      </div>
      <ArrowRight
        className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
        size={15}
      />
    </Link>
  );
}

function ReportFamilyNavigation({
  activeCategory,
  viewQuery,
}: {
  activeCategory?: ReportCatalogItem["category"];
  viewQuery: ReportsViewQuery;
}) {
  return (
    <LocalWorkspaceNav
      items={[
        { active: !activeCategory, href: "/reports", label: "All reports" },
        ...reportCategories.map((category) => {
          const firstReport = reportCatalog.find(
            (report) => report.category === category,
          );

          return {
            active: activeCategory === category,
            href: firstReport
              ? buildCatalogCardHref(firstReport.kind, viewQuery)
              : "/reports",
            label: category,
          };
        }),
      ]}
      label="Report families"
    />
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
          {shouldExplainAccountingScope(trustedReport.kind) ? (
            <p className="mt-1 text-[13px] leading-5 text-foreground-muted">
              {trustedReport.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <ReportMeta label="Rows" value={String(totalRowCount)} />
        <ReportMeta label="Scope" value={trustedReport.scopeLabel} />
        <ReportMeta label="Period" value={trustedReport.periodLabel} />
      </div>
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
    <div
      className="grid grid-cols-2 gap-2 md:grid-cols-4 print:grid print:grid-cols-4 print:gap-2"
      data-report-summary="true"
    >
      {report.summary.map((metric) => (
        <div
          className="rounded-md border border-border bg-surface px-3 py-2 print:break-inside-avoid print:border-black print:bg-white print:text-black"
          key={metric.label}
          title={`${metric.detail}. Source count: ${metric.sourceCount}`}
        >
          <p className="text-xs font-medium text-foreground-muted print:text-black">
            {metric.label}
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground print:text-black">
            {metric.value}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted print:text-black">
            {metric.sourceCount} source records
          </p>
        </div>
      ))}
    </div>
  );
}

function TrustedReportTable({
  organizationName,
  report,
  viewQuery,
}: {
  organizationName: string;
  report: TrustedReport;
  viewQuery: ReportsViewQuery;
}) {
  const totalRowCount = report.totalRowCount ?? report.rows.length;
  const isPreviewLimited = totalRowCount > report.rows.length;

  if (report.scopeValidation) {
    return (
      <section className="overflow-hidden rounded-md border border-warning/30 bg-surface shadow-sm">
        <EmptyState
          action={
            <Link
              className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
              href={buildClearReportFiltersHref(viewQuery)}
              prefetch={false}
            >
              Clear filters
            </Link>
          }
          body={report.scopeValidation.message}
          kind="error"
          title="Report scope is not available"
        />
      </section>
    );
  }

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

      <div
        className="border-b border-border bg-surface-muted/60 px-4 py-2.5 text-[13px] text-foreground-muted print:block print:border-black print:bg-white print:px-0 print:text-black"
        data-report-trace="true"
      >
        {isPreviewLimited
          ? `Showing first ${report.rows.length} of ${totalRowCount} rows. Export CSV for the full report.`
          : report.totalsTraceLabel}
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          action={
            <Link
              className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
              href={
                hasActiveReportFilters(viewQuery)
                  ? buildClearReportFiltersHref(viewQuery)
                  : "/reports"
              }
              prefetch={false}
            >
              {hasActiveReportFilters(viewQuery)
                ? "Clear filters"
                : "Report library"}
            </Link>
          }
          body={report.emptyDescription}
          kind={hasActiveReportFilters(viewQuery) ? "filtered" : "empty"}
          title={report.emptyTitle}
        />
      ) : (
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
                <th className="border-b border-border px-3 py-2">
                  {report.kind === "owner-statement"
                    ? "Actions / sources"
                    : "Sources"}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <TrustedReportTableRow
                  columns={report.columns}
                  key={row.id}
                  reportKind={report.kind}
                  row={row}
                  viewQuery={viewQuery}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TrustedReportTableRow({
  columns,
  reportKind,
  row,
  viewQuery,
}: {
  columns: TrustedReport["columns"];
  reportKind: TrustedReport["kind"];
  row: TrustedReportRow;
  viewQuery: ReportsViewQuery;
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
        {reportKind === "owner-statement" &&
        row.ownerPersonId &&
        row.propertyId ? (
          <OwnerStatementRowActions row={row} viewQuery={viewQuery} />
        ) : (
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
        )}
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

function shouldExplainAccountingScope(kind: TrustedReport["kind"]) {
  return kind === "income-expense" || kind === "owner-statement";
}

function hasActiveReportFilters(query: ReportsViewQuery) {
  return (
    query.propertyId !== "all" ||
    (query.report !== "owner-statement" && query.unitId !== "all") ||
    ((query.report === "rent-roll" || query.report === "vacancy-risk") &&
      query.status !== "all") ||
    (query.report === "owner-statement" &&
      (query.ownerPersonId !== "all" || query.ownerPersonIdInvalid === true))
  );
}

function buildClearReportFiltersHref(query: ReportsViewQuery) {
  return buildReportBuilderHref(
    query.report,
    new URLSearchParams({ month: query.month }),
  );
}

function buildCsvHref(query: ReportsViewQuery) {
  const params = new URLSearchParams();

  params.set("report", query.report);
  params.set("month", query.month);

  if (query.propertyId !== "all") {
    params.set("propertyId", query.propertyId);
  }

  if (query.unitId !== "all" && query.report !== "owner-statement") {
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

  if (
    query.report === "owner-statement" &&
    query.ownerPersonId !== "all"
  ) {
    params.set("ownerPersonId", query.ownerPersonId);
  }

  if (query.unitId !== "all" && query.report !== "owner-statement") {
    params.set("unitId", query.unitId);
  }

  if (query.status !== "all") {
    params.set("status", query.status);
  }

  return `/api/reports/pdf?${params.toString()}`;
}

function buildOwnerStatementPreviewHref(
  query: ReportsViewQuery,
  print = false,
) {
  const params = new URLSearchParams({
    month: query.month,
    ownerPersonId: query.ownerPersonId,
    propertyId: query.propertyId,
  });
  if (print) params.set("print", "1");
  return `/reports/owner-statement?${params.toString()}`;
}

function buildOwnerStatementReadinessHref(query: ReportsViewQuery) {
  const params = new URLSearchParams({ month: query.month });
  if (query.propertyId !== "all") {
    params.set("propertyId", query.propertyId);
  }
  return `/reports/owner-statement?${params.toString()}`;
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
