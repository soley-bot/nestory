import { UnitDetailScreen } from "@/features/units/components/unit-detail-screen";
import { getUnitDetail } from "@/features/units/data/units";
import { parseUnitDetailQuery } from "@/features/units/unit-detail-route";
import { requirePermission } from "@/lib/auth/context";
import UnitNotFound from "./not-found";

type UnitPageProps = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnitPage({ params, searchParams }: UnitPageProps) {
  const [{ unitId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const { section, sourceTaskId } = parseUnitDetailQuery(rawSearchParams);
  const context = await requirePermission("properties.view");
  const unit = await getUnitDetail(context.organizationId, unitId);

  if (!unit) {
    return <UnitNotFound />;
  }

  const scopeKey = [
    context.organizationId,
    context.userId,
    context.branchId,
    context.personId,
    context.roleId,
    context.isSuperAdmin,
    [...context.permissionKeys].sort().join(","),
    unit.id,
    unit.propertyId,
  ].join(":");

  return (
    <UnitDetailScreen
      activeSection={section}
      canArchive={context.permissionKeys.has("properties.archive")}
      canRecordDepositReceipt={context.permissionKeys.has("leases.change_terms")}
      canWrite={context.permissionKeys.has("properties.write")}
      key={scopeKey}
      sourceTaskId={sourceTaskId}
      unit={unit}
    />
  );
}
