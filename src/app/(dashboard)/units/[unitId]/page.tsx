import { UnitDetailScreen } from "@/features/units/components/unit-detail-screen";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { getPropertySummaries } from "@/features/properties/data/properties";
import { getUnitDetail } from "@/features/units/data/units";
import { parseUnitDetailQuery } from "@/features/units/unit-detail-route";
import type { UnitPropertyOption } from "@/features/units/unit.types";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { formatPropertyOptionLabel } from "@/lib/entity-option-labels";
import UnitNotFound from "./not-found";

type UnitPageProps = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitPage({ params, searchParams }: UnitPageProps) {
  const [{ unitId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const { section, sourceTaskId } = parseUnitDetailQuery(rawSearchParams);
  const context = await requireSuperAdminContext();
  const [unit, properties] = await Promise.all([
    getUnitDetail(context.organizationId, unitId),
    getPropertySummaries(context.organizationId),
  ]);

  if (!unit) {
    return <UnitNotFound />;
  }

  const maintenanceActor = {
    branchId: context.branchId,
    personId: context.personId,
    role: context.role,
  } as const;
  const maintenanceData = await getMaintenanceScreenData(
    context.organizationId,
    parseMaintenanceSearchParams({
      pageSize: "6",
      propertyId: unit.propertyId,
      unitId: unit.id,
    }),
    maintenanceActor,
  );

  return (
    <UnitDetailScreen
      activeSection={section}
      maintenanceFormOptions={{
        actor: maintenanceActor,
        branches: maintenanceData.branchOptions,
        canRecordActualCost: getMaintenanceCapabilities(context.role)
          .canRecordActualCost,
        properties: maintenanceData.propertyOptions,
        staff: maintenanceData.staffOptions,
        units: maintenanceData.unitOptions,
        vendors: maintenanceData.vendorOptions,
      }}
      propertyOptions={toPropertyOptions(properties)}
      sourceTaskId={sourceTaskId}
      unit={unit}
    />
  );
}

function toPropertyOptions(
  properties: Awaited<ReturnType<typeof getPropertySummaries>>,
): UnitPropertyOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: formatPropertyOptionLabel(property),
  }));
}
