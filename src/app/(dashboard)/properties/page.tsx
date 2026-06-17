import { PropertyScreen } from "@/features/properties/components/property-screen";
import { getPropertiesScreenData } from "@/features/properties/data/properties";
import { parsePropertySearchParams } from "@/features/properties/property.filters";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import { requireAdminContext } from "@/lib/auth/context";

type PropertiesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropertiesPage({
  searchParams,
}: PropertiesPageProps) {
  const context = await requireAdminContext();
  const viewQuery = parsePropertySearchParams(await searchParams);
  const currencySettings = await getOrganizationCurrencySettings(
    context.organizationId,
  );
  const { pagination, properties } = await getPropertiesScreenData(
    context.organizationId,
    currencySettings,
    viewQuery,
  );

  return (
    <PropertyScreen
      pagination={pagination}
      properties={properties}
      viewQuery={viewQuery}
    />
  );
}
