import { UnitScreen } from "@/features/units/components/unit-screen";
import {
  getUnitPropertyOptions,
  getUnitsScreenData,
} from "@/features/units/data/units";
import { parseUnitSearchParams } from "@/features/units/unit.filters";
import { requireAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type UnitsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitsPage({ searchParams }: UnitsPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const viewQuery = parseUnitSearchParams(params);
  const [{ pagination, units }, propertyOptions] = await Promise.all([
    getUnitsScreenData(context.organizationId, viewQuery),
    getUnitPropertyOptions(context.organizationId),
  ]);
  const initialUnitId = getUuidSearchParam(params.unitId);

  return (
    <UnitScreen
      key={initialUnitId ?? "units"}
      initialUnitId={initialUnitId}
      pagination={pagination}
      propertyOptions={propertyOptions}
      units={units}
      viewQuery={viewQuery}
    />
  );
}
