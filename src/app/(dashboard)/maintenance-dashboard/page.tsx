import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import {
  DashboardPeriodPicker,
  type DashboardPeriodOption,
} from "@/components/dashboard/dashboard-period-picker";
import { PageHeader } from "@/components/layout/page-header";
import { MaintenanceBreakdown } from "@/features/maintenance/components/maintenance-breakdown";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import {
  getMaintenanceListHref,
  getMaintenanceReportHref,
} from "@/features/maintenance/maintenance.hrefs";
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
  const monthOptions = getMaintenanceMonthOptions(viewQuery.month);
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
            <DashboardPeriodPicker
              href="/maintenance-dashboard"
              options={monthOptions}
              paramName="month"
              selectedPeriod={viewQuery.month}
            />
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
              href={getMaintenanceReportHref(viewQuery)}
            >
              <FileText size={15} />
              Report
            </Link>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-primary bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              href={getMaintenanceListHref(viewQuery, { review: "open" })}
            >
              <ArrowUpRight size={15} />
              Open cases
            </Link>
          </>
        }
        title="Maintenance Dashboard"
      />
      <main className="space-y-3 px-4 py-3 sm:px-5 lg:px-5">
        <MaintenanceBreakdown summary={data.summary} viewQuery={viewQuery} />
      </main>
    </div>
  );
}

function getMaintenanceMonthOptions(
  month: string,
): Array<DashboardPeriodOption<string>> {
  const previousMonth = shiftDashboardMonth(month, -1);
  const nextMonth = shiftDashboardMonth(month, 1);

  return [
    { key: month, label: formatDashboardMonthLabel(month), helper: "Selected month" },
    {
      key: previousMonth,
      label: formatDashboardMonthLabel(previousMonth),
      helper: "Previous month",
    },
    {
      key: nextMonth,
      label: formatDashboardMonthLabel(nextMonth),
      helper: "Next month",
    },
  ];
}

function shiftDashboardMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    return month;
  }

  const date = new Date(year, monthNumber - 1 + amount, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDashboardMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    return month;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}
