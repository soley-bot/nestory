import type { ReactNode } from "react";
import Link from "next/link";
import { Download, Eye, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
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
    <div>
      <PageHeader
        description="People-domain reports for tenant, owner, vendor, and staff readiness."
        title="People Reports"
      />
      <main className="space-y-4 px-4 py-4 sm:px-6 lg:px-6">
        <section className="grid gap-3 md:grid-cols-4">
          {insights.metrics.map((metric) => (
            <Link
              className="rounded-md border border-border bg-surface px-3 py-3 transition-colors hover:bg-surface-muted"
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
              <h2 className="text-sm font-semibold">Report packets</h2>
              <p className="mt-1 text-xs text-muted">
                Exports use the first {data.reportLimit} active people records
                currently available to the People module.
              </p>
            </div>
            <Badge className="px-2 text-xs" tone="neutral">
              {data.pagination.totalCount} active records
            </Badge>
          </div>

          <div className="grid gap-3 p-4 lg:grid-cols-2 xl:grid-cols-3">
            {peopleReportOptions.map((report) => (
              <article
                className="flex min-h-[184px] flex-col rounded-md border border-border bg-surface-muted/35 p-3"
                key={report.kind}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-surface">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{report.title}</h3>
                    <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-muted">
                      {report.description}
                    </p>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
                  <ReportLink href={report.href} label="Preview">
                    <Eye size={14} />
                  </ReportLink>
                  <ReportLink
                    href={getPeopleReportExportHref(report.kind, "csv")}
                    label="CSV"
                  >
                    <Download size={14} />
                  </ReportLink>
                  <ReportLink
                    href={getPeopleReportExportHref(report.kind, "pdf")}
                    label="PDF"
                  >
                    <Download size={14} />
                  </ReportLink>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function ReportLink({
  children,
  href,
  label,
}: {
  children: ReactNode;
  href: string;
  label: string;
}) {
  return (
    <Link
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
