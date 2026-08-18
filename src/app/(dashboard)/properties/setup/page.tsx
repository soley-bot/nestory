import { PropertySetupScreen } from "@/features/property-setup/components/property-setup-screen";
import { getPropertySetupData } from "@/features/property-setup/data/property-setup";
import {
  normalizePropertySetupStep,
  propertySetupRequiresUnit,
} from "@/features/property-setup/property-setup";
import type { PropertySetupSelection } from "@/features/property-setup/property-setup.types";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { getFirstSearchParam, getUuidSearchParam } from "@/lib/validation/search-params";

type PropertySetupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertySetupPage({ searchParams }: PropertySetupPageProps) {
  const context = await requireSuperAdminContext();
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
  const requiresUnit = propertySetupRequiresUnit(data.properties, data.selection);
  const step = normalizePropertySetupStep(requestedStep, data.selection, {
    ready: data.readiness?.ready !== false,
    requiresUnit,
  });

  return <PropertySetupScreen data={data} step={step} />;
}
