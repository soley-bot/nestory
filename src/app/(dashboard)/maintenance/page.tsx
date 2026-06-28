import { MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { requireAdminContext } from "@/lib/auth/context";

type MaintenancePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MaintenancePage({
  searchParams,
}: MaintenancePageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const viewQuery = parseMaintenanceSearchParams(params);
  const data = await getMaintenanceScreenData(context.organizationId, viewQuery);
  const initialTaskId = viewQuery.taskId === "all" ? undefined : viewQuery.taskId;

  return (
    <MaintenanceScreen
      cases={data.cases}
      initialTaskId={initialTaskId}
      pagination={data.pagination}
      peopleOptions={data.peopleOptions}
      propertyOptions={data.propertyOptions}
      summary={data.summary}
      unitOptions={data.unitOptions}
      viewQuery={viewQuery}
    />
  );
}
