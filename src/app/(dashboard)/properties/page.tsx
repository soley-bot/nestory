import { PropertyScreen } from "@/features/properties/components/property-screen";
import {
  getPropertiesScreenData,
  getPropertyOwnerOptions,
} from "@/features/properties/data/properties";
import { parsePropertySearchParams } from "@/features/properties/property.filters";
import { requireAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type PropertiesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertiesPage({
  searchParams,
}: PropertiesPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const viewQuery = parsePropertySearchParams(params);
  const [{ pagination, properties }, ownerOptions] = await Promise.all([
    getPropertiesScreenData(context.organizationId, viewQuery),
    getPropertyOwnerOptions(context.organizationId),
  ]);
  const initialPropertyId = getUuidSearchParam(params.propertyId);

  return (
    <PropertyScreen
      key={initialPropertyId ?? "properties"}
      initialPropertyId={initialPropertyId}
      ownerOptions={ownerOptions}
      pagination={pagination}
      properties={properties}
      viewQuery={viewQuery}
    />
  );
}
