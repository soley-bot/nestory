import { PropertyScreen } from "@/features/properties/components/property-screen";
import { redirect } from "next/navigation";
import { getActivePropertyBranchOptions } from "@/features/properties/data/property-branches";
import {
  getPropertiesScreenData,
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
  const [{ financialGeneration, pagination, properties }, portfolioSummary, creationBranchOptions] = await Promise.all([
    getPropertiesScreenData(context.organizationId, viewQuery),
    getPropertyPortfolioSummary(context.organizationId),
    context.isSuperAdmin
      ? getActivePropertyBranchOptions(context.organizationId)
      : Promise.resolve(undefined),
  ]);
  return (
    <PropertyScreen
      financialGeneration={financialGeneration}
      canCreate={context.permissionKeys.has("properties.write")}
      canSetUp={context.permissionKeys.has("leases.activate")}
      creationBranchOptions={creationBranchOptions}
      ownerOptions={[]}
      pagination={pagination}
      portfolioSummary={portfolioSummary}
      properties={properties}
      viewQuery={viewQuery}
    />
  );
}
