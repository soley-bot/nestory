import { notFound } from "next/navigation";
import { UnitDetailScreen } from "@/features/units/components/unit-detail-screen";
import { getPropertySummaries } from "@/features/properties/data/properties";
import { getUnitDetail } from "@/features/units/data/units";
import type { UnitPropertyOption } from "@/features/units/unit.types";
import { requireAdminContext } from "@/lib/auth/context";

type UnitPageProps = {
  params: Promise<{ unitId: string }>;
};

export default async function UnitPage({ params }: UnitPageProps) {
  const { unitId } = await params;
  const context = await requireAdminContext();
  const [unit, properties] = await Promise.all([
    getUnitDetail(context.organizationId, unitId),
    getPropertySummaries(context.organizationId),
  ]);

  if (!unit) {
    notFound();
  }

  return (
    <UnitDetailScreen
      propertyOptions={toPropertyOptions(properties)}
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
