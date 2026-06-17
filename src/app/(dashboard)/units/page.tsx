import { UnitScreen } from "@/features/units/components/unit-screen";
import { getPropertySummaries } from "@/features/properties/data/properties";
import { getUnitsScreenData } from "@/features/units/data/units";
import { parseUnitSearchParams } from "@/features/units/unit.filters";
import type { UnitPropertyOption } from "@/features/units/unit.types";
import { requireAdminContext } from "@/lib/auth/context";

type UnitsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitsPage({ searchParams }: UnitsPageProps) {
  const context = await requireAdminContext();
  const viewQuery = parseUnitSearchParams(await searchParams);
  const [{ pagination, units }, properties] = await Promise.all([
    getUnitsScreenData(context.organizationId, viewQuery),
    getPropertySummaries(context.organizationId),
  ]);

  return (
    <UnitScreen
      pagination={pagination}
      propertyOptions={toPropertyOptions(properties)}
      units={units}
      viewQuery={viewQuery}
    />
  );
}

function toPropertyOptions(
  properties: Awaited<ReturnType<typeof getPropertySummaries>>,
): UnitPropertyOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: `${property.code} - ${property.name}`,
  }));
}
