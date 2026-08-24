import { PropertySetupScreen } from "@/features/property-setup/components/property-setup-screen";
import { getPropertySetupData } from "@/features/property-setup/data/property-setup";
import { getActivePropertyBranchOptions } from "@/features/properties/data/property-branches";
import {
  normalizePropertySetupStep,
  propertySetupRequiresUnit,
} from "@/features/property-setup/property-setup";
import type { PropertySetupSelection } from "@/features/property-setup/property-setup.types";
import { requirePermission } from "@/lib/auth/context";
import { getFirstSearchParam, getUuidSearchParam } from "@/lib/validation/search-params";
import { getLeaseBillingFormConfig } from "@/features/leases/data/leases";

type PropertySetupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertySetupPage({ searchParams }: PropertySetupPageProps) {
  const context = await requirePermission("properties.view");
  await requirePermission("leases.activate");
  const params = await searchParams;
  const requestedSelection: PropertySetupSelection = {
    leaseId: getUuidSearchParam(params.leaseId) ?? null,
    ownerId: getUuidSearchParam(params.ownerId) ?? null,
    propertyId: getUuidSearchParam(params.propertyId) ?? null,
    tenantId: getUuidSearchParam(params.tenantId) ?? null,
    unitId: getUuidSearchParam(params.unitId) ?? null,
  };
  const [data, creationBranchOptions, billingFormConfig] = await Promise.all([
    getPropertySetupData({
      organizationId: context.organizationId,
      requestedSelection,
    }),
    context.isSuperAdmin
      ? getActivePropertyBranchOptions(context.organizationId)
      : Promise.resolve(undefined),
    getLeaseBillingFormConfig(context.organizationId),
  ]);
  const requestedStep = Number(getFirstSearchParam(params.step) ?? 1);
  const requiresUnit = propertySetupRequiresUnit(data.properties, data.selection);
  const step = normalizePropertySetupStep(requestedStep, data.selection, {
    ready: data.readiness?.ready === true,
    requiresUnit,
  });

  return (
    <PropertySetupScreen
      billingFormConfig={billingFormConfig}
      canRecordDepositReceipt={context.permissionKeys.has("leases.change_terms")}
      creationBranchOptions={creationBranchOptions}
      data={data}
      step={step}
    />
  );
}
