import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import type { MaintenanceSurfaceVariant } from "@/features/maintenance/components/maintenance-work-surfaces";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import type { MaintenanceViewQuery } from "@/features/maintenance/maintenance.types";
import { requireWorkspaceContext } from "@/lib/auth/context";

type MaintenancePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaintenancePage({
  searchParams,
}: MaintenancePageProps) {
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);

  if (context.role === "member" && !context.personId) {
    return <UnlinkedMemberMaintenanceState />;
  }

  const params = await searchParams;
  const viewQuery = normalizeCasesViewQuery(parseMaintenanceSearchParams(params));
  const routeConfig = getCasesRouteConfig(viewQuery);
  const data = await getMaintenanceScreenData(context.organizationId, viewQuery, {
    branchId: context.branchId,
    personId: context.personId,
    role: context.role,
  });
  const initialTaskId = viewQuery.taskId === "all" ? undefined : viewQuery.taskId;

  return (
    <MaintenanceScreen
      actor={{
        branchId: context.branchId,
        personId: context.personId,
        role: context.role,
      }}
      branchOptions={data.branchOptions}
      capabilities={capabilities}
      cases={data.cases}
      createButtonLabel="New case"
      description="Maintenance intake, work orders, scheduling, templates, costs, and closeout in one operating queue."
      emptyLabel={routeConfig.emptyLabel}
      flowLabel={routeConfig.flowLabel}
      initialTaskId={initialTaskId}
      listLabel="cases"
      pagination={data.pagination}
      peopleOptions={data.peopleOptions}
      propertyOptions={data.propertyOptions}
      recordLabel="case"
      staffOptions={data.staffOptions}
      showCaseViewTabs
      showReportAction={context.role === "admin"}
      showReviewTabs={routeConfig.showReviewTabs}
      showScopeSummary={routeConfig.showScopeSummary}
      summary={data.summary}
      surfaceVariant={routeConfig.surfaceVariant}
      title="Cases"
      unitOptions={data.unitOptions}
      viewQuery={viewQuery}
    />
  );
}

function UnlinkedMemberMaintenanceState() {
  return (
    <div className="min-h-screen">
      <PageHeader
        description="Your login is active, but it is not connected to a staff record yet."
        title="Maintenance"
      />
      <main className="px-4 py-4 sm:px-6 lg:px-6">
        <section className="max-w-2xl rounded-md border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Staff profile link required</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Ask an administrator to link your login to your staff profile before
            assigned maintenance work can appear here.
          </p>
          <Link
            className="mt-4 inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted"
            href="/account"
          >
            View account
          </Link>
        </section>
      </main>
    </div>
  );
}

function normalizeCasesViewQuery(
  viewQuery: MaintenanceViewQuery,
): MaintenanceViewQuery {
  if (viewQuery.view === "inbox") {
    return { ...viewQuery, view: "list" };
  }

  if (viewQuery.view === "board" && viewQuery.review === "open") {
    return { ...viewQuery, review: "work_orders" };
  }

  if (viewQuery.view === "calendar" && viewQuery.review === "open") {
    return {
      ...viewQuery,
      pageSize: 100,
      review: "scheduled",
      sort: "due_asc",
    };
  }

  if (viewQuery.view === "templates" && viewQuery.review === "open") {
    return { ...viewQuery, review: "recurring" };
  }

  return viewQuery;
}

function getCasesRouteConfig(viewQuery: MaintenanceViewQuery): {
  emptyLabel: string;
  flowLabel: string;
  showReviewTabs: boolean;
  showScopeSummary: boolean;
  surfaceVariant: MaintenanceSurfaceVariant;
} {
  if (viewQuery.view === "list") {
    return {
      emptyLabel: "No maintenance cases found.",
      flowLabel: "Work queue",
      showReviewTabs: false,
      showScopeSummary: false,
      surfaceVariant: "table",
    };
  }

  if (viewQuery.view === "board") {
    return {
      emptyLabel: "No work orders found.",
      flowLabel: "Execution queue",
      showReviewTabs: true,
      showScopeSummary: true,
      surfaceVariant: "board",
    };
  }

  if (viewQuery.view === "calendar") {
    return {
      emptyLabel: "No scheduled maintenance found.",
      flowLabel: "Calendar queue",
      showReviewTabs: false,
      showScopeSummary: false,
      surfaceVariant: "agenda",
    };
  }

  if (viewQuery.view === "templates") {
    return {
      emptyLabel: "No recurring maintenance found.",
      flowLabel: "Preventive maintenance",
      showReviewTabs: true,
      showScopeSummary: true,
      surfaceVariant: "routine",
    };
  }

  return {
    emptyLabel: "No maintenance cases found.",
    flowLabel: "Work queue",
    showReviewTabs: false,
    showScopeSummary: false,
    surfaceVariant: "table",
  };
}
