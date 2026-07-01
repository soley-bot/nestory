import Link from "next/link";
import { FileText, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MaintenanceBreakdown } from "@/features/maintenance/components/maintenance-breakdown";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { getMaintenanceReportHref } from "@/features/maintenance/maintenance.hrefs";
import { requireWorkspaceContext } from "@/lib/auth/context";

type MaintenanceDashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaintenanceDashboardPage({
  searchParams,
}: MaintenanceDashboardPageProps) {
  const context = await requireWorkspaceContext();
  const params = await searchParams;
  const viewQuery = parseMaintenanceSearchParams({ review: "all", ...params });
  const data = await getMaintenanceScreenData(context.organizationId, viewQuery, {
    branchId: context.branchId,
    personId: context.personId,
    role: context.role,
  });

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
              href={getMaintenanceReportHref(viewQuery)}
            >
              <FileText size={15} />
              Make report
            </Link>
            {context.role !== "member" ? (
              <Link
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
                href="/maintenance?action=create"
              >
                <Wrench size={15} />
                New case
              </Link>
            ) : null}
          </>
        }
        description="Maintenance health, reminders, repeated issues, and property/unit workload."
        title="Maintenance Dashboard"
      />
      <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6">
        <MaintenanceBreakdown summary={data.summary} viewQuery={viewQuery} />
      </main>
    </div>
  );
}
