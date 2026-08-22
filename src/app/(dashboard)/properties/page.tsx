import { PropertyScreen } from "@/features/properties/components/property-screen";
import { redirect } from "next/navigation";
import { getActivePropertyBranchOptions } from "@/features/properties/data/property-branches";
import {
  getPropertiesScreenData,
  getPropertyOwnerOptions,
} from "@/features/properties/data/properties";
import { getPropertyPortfolioSummary } from "@/features/properties/data/property-portfolio-summary";
import { parsePropertySearchParams } from "@/features/properties/property.filters";
import { requirePermission } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type PropertiesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertiesPage({
  searchParams,
}: PropertiesPageProps) {
  const context = await requirePermission("properties.view");
  const params = await searchParams;
  const initialPropertyId = getUuidSearchParam(params.propertyId);

  if (initialPropertyId) {
    redirect(`/properties/${initialPropertyId}`);
  }

  const viewQuery = parsePropertySearchParams(params);
  const [{ pagination, properties }, ownerOptions, portfolioSummary, creationBranchOptions] = await Promise.all([
    getPropertiesScreenData(context.organizationId, viewQuery),
    getPropertyOwnerOptions(context.organizationId),
    getPropertyPortfolioSummary(context.organizationId),
    context.isSuperAdmin
      ? getActivePropertyBranchOptions(context.organizationId)
      : Promise.resolve(undefined),
  ]);
  return (
    <PropertyScreen
      canCreate={context.permissionKeys.has("properties.write")}
      canSetUp={context.permissionKeys.has("leases.activate")}
      creationBranchOptions={creationBranchOptions}
      ownerOptions={ownerOptions}
      pagination={pagination}
      portfolioSummary={portfolioSummary}
      properties={properties}
      viewQuery={viewQuery}
    />
  );
}
