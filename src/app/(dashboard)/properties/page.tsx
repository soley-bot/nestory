import { PropertyScreen } from "@/features/properties/components/property-screen";
import { redirect } from "next/navigation";
import {
  getPropertiesScreenData,
  getPropertyOwnerOptions,
} from "@/features/properties/data/properties";
import { getPropertyPortfolioSummary } from "@/features/properties/data/property-portfolio-summary";
import { parsePropertySearchParams } from "@/features/properties/property.filters";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type PropertiesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertiesPage({
  searchParams,
}: PropertiesPageProps) {
  const context = await requireSuperAdminContext();
  const params = await searchParams;
  const initialPropertyId = getUuidSearchParam(params.propertyId);

  if (initialPropertyId) {
    redirect(`/properties/${initialPropertyId}`);
  }

  const viewQuery = parsePropertySearchParams(params);
  const [{ pagination, properties }, ownerOptions, portfolioSummary] = await Promise.all([
    getPropertiesScreenData(context.organizationId, viewQuery),
    getPropertyOwnerOptions(context.organizationId),
    getPropertyPortfolioSummary(context.organizationId),
  ]);
  return (
    <PropertyScreen
      canCreate
      ownerOptions={ownerOptions}
      pagination={pagination}
      portfolioSummary={portfolioSummary}
      properties={properties}
      viewQuery={viewQuery}
    />
  );
}
