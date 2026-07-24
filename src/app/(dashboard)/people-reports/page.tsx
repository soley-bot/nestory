import type { ReactNode } from "react";
import Link from "next/link";
import { Download, Eye, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Badge } from "@/components/ui/badge";
import { getPeopleReportHubData } from "@/features/people/data/people-reports";
import {
  getPeopleInsights,
  getPeopleReportExportHref,
  peopleReportOptions,
} from "@/features/people/people.insights";
import { requireAdminContext } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

export default async function PeopleReportsPage() {
  const context = await requireAdminContext();
  const data = await getPeopleReportHubData(context.organizationId);
  const insights = getPeopleInsights(data.people, data.pagination.totalCount);

  return (
    <WorkspacePage
      header={
        <PageHeader
          context={`${peopleReportOptions.length} People report types`}
          title="People Reports"
        />
      }
    >
      <main className="h-full space-y-4 overflow-y-auto px-4 py-4 sm:px-6 lg:px-6">
        <section
          aria-label="People report summary"
          className="flex min-w-0 gap-2 overflow-x-auto"
          data-mobile-summary-strip="people-report-metrics"
          role="region"
        >
          {insights.metrics.map((metric) => (
            <Link
              className="min-w-[180px] flex-1 rounded-md border border-border bg-surface px-3 py-2.5 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
              href={metric.href}
              key={metric.label}
              prefetch={false}
            >
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
                {metric.label}
              </p>
              <p className="mt-1 text-xl font-semibold leading-none">
                {metric.value}
              </p>
              <p className="mt-1 truncate text-xs text-muted">{metric.helper}</p>
            </Link>
          ))}
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Generate reports</h2>
              <p className="mt-1 text-xs text-muted">
                {data.reportLimit} of {data.pagination.totalCount} active records
                in this report window. Role reports keep their existing People
                scope.
              </p>
            </div>
            <Badge className="px-2 text-xs" tone="neutral">
              {data.pagination.totalCount} active records
            </Badge>
          </div>

          <div className="divide-y divide-border">
            {peopleReportOptions.map((report) => (
              <div
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                data-people-report-item="true"
                key={report.kind}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-surface">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{report.title}</h3>
                    <p className="mt-0.5 text-xs text-muted">Active People records</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2" data-report-stage="preview-export">
                  <ReportLink
                    ariaLabel={`Preview ${report.title}`}
                    href={report.href}
                    label="Preview"
                  >
                    <Eye size={14} />
                  </ReportLink>
                  <ReportLink
                    ariaLabel={`Export ${report.title} CSV`}
                    href={getPeopleReportExportHref(report.kind, "csv")}
                    label="CSV"
                  >
                    <Download size={14} />
                  </ReportLink>
                  <ReportLink
                    ariaLabel={`Export ${report.title} PDF`}
                    href={getPeopleReportExportHref(report.kind, "pdf")}
                    label="PDF"
                  >
                    <Download size={14} />
                  </ReportLink>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </WorkspacePage>
  );
}

function ReportLink({
  ariaLabel,
  children,
  href,
  label,
}: {
  ariaLabel: string;
  children: ReactNode;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md",
        "border border-border bg-surface px-2 text-[13px] font-medium",
        "transition-colors hover:bg-surface-muted",
      )}
      href={href}
      prefetch={false}
    >
      {children}
      <span className="truncate">{label}</span>
    </Link>
  );
}
