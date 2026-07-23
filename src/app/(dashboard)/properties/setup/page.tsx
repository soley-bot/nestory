import { PropertySetupScreen } from "@/features/property-setup/components/property-setup-screen";
import { getPropertySetupData } from "@/features/property-setup/data/property-setup";
import { normalizePropertySetupStep } from "@/features/property-setup/property-setup";
import type { PropertySetupSelection } from "@/features/property-setup/property-setup.types";
import { requireAdminContext } from "@/lib/auth/context";
import { getFirstSearchParam, getUuidSearchParam } from "@/lib/validation/search-params";

type PropertySetupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertySetupPage({ searchParams }: PropertySetupPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const requestedSelection: PropertySetupSelection = {
    leaseId: getUuidSearchParam(params.leaseId) ?? null,
    ownerId: getUuidSearchParam(params.ownerId) ?? null,
    propertyId: getUuidSearchParam(params.propertyId) ?? null,
    tenantId: getUuidSearchParam(params.tenantId) ?? null,
    unitId: getUuidSearchParam(params.unitId) ?? null,
  };
  const data = await getPropertySetupData({
    organizationId: context.organizationId,
    requestedSelection,
  });
  const requestedStep = Number(getFirstSearchParam(params.step) ?? 1);
  const step = normalizePropertySetupStep(requestedStep, data.selection);

  return <PropertySetupScreen data={data} step={step} />;
}
