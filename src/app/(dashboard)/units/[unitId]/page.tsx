import { UnitDetailScreen } from "@/features/units/components/unit-detail-screen";
import { getPropertySummaries } from "@/features/properties/data/properties";
import { getUnitDetail } from "@/features/units/data/units";
import { parseUnitDetailQuery } from "@/features/units/unit-detail-route";
import type { UnitPropertyOption } from "@/features/units/unit.types";
import { requireAdminContext } from "@/lib/auth/context";
import UnitNotFound from "./not-found";

type UnitPageProps = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitPage({ params, searchParams }: UnitPageProps) {
  const [{ unitId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const { section, sourceTaskId } = parseUnitDetailQuery(rawSearchParams);
  const context = await requireAdminContext();
  const [unit, properties] = await Promise.all([
    getUnitDetail(context.organizationId, unitId),
    getPropertySummaries(context.organizationId),
  ]);

  if (!unit) {
    return <UnitNotFound />;
  }

  return (
    <UnitDetailScreen
      activeSection={section}
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
    label: `${property.code} - ${property.name}`,
  }));
}
