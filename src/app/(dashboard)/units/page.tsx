import { UnitScreen } from "@/features/units/components/unit-screen";
import {
  getUnitPropertyOptions,
  getUnitsScreenData,
} from "@/features/units/data/units";
import { parseUnitSearchParams } from "@/features/units/unit.filters";
import { requirePermission } from "@/lib/auth/context";

type UnitsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitsPage({ searchParams }: UnitsPageProps) {
  const context = await requirePermission("properties.view");
  const params = await searchParams;
  const viewQuery = parseUnitSearchParams(params);
  const [{ pagination, units }, propertyOptions] = await Promise.all([
    getUnitsScreenData(context.organizationId, viewQuery),
    getUnitPropertyOptions(context.organizationId),
  ]);
  return (
    <UnitScreen
      canCreate={context.permissionKeys.has("properties.write")}
      pagination={pagination}
      propertyOptions={propertyOptions}
      units={units}
      viewQuery={viewQuery}
    />
  );
}
