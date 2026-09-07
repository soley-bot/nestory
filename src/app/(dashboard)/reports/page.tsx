import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { reportCatalog } from "@/features/reports/report-catalog";
import { requireFinanceReportContext } from "@/lib/auth/context";

export default async function ReportsPage() {
  const context = await requireFinanceReportContext();

  return (
    <WorkspacePage title="Reports">
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
        {context.capabilities.canReadFinance ? <Link
          className="group flex min-h-36 flex-col rounded-lg border border-border bg-card p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
          href="/balances?view=statements"
        >
          <h2 className="text-base font-semibold text-foreground">Official owner statements</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
            Saved monthly statements for each owner. Download PDF or Excel.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            View statements
            <ArrowRight aria-hidden="true" size={15} />
          </span>
        </Link> : null}
        {reportCatalog.map((report) => (
          <Link
            className="group flex min-h-36 flex-col rounded-lg border border-border bg-card p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            href={`/reports/${report.kind}`}
            key={report.kind}
          >
            <h2 className="text-base font-semibold text-foreground">
              {report.title}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
              {report.description}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Open report
              <ArrowRight aria-hidden="true" size={15} />
            </span>
          </Link>
        ))}
      </div>
    </WorkspacePage>
  );
}
