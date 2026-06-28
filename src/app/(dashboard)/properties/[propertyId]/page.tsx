import { notFound } from "next/navigation";
import { PropertyDetailScreen } from "@/features/properties/components/property-detail-screen";
import {
  getPropertyDetail,
  getPropertyOwnerOptions,
} from "@/features/properties/data/properties";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import { requireAdminContext } from "@/lib/auth/context";

type PropertyPageProps = {
  params: Promise<{ propertyId: string }>;
};

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { propertyId } = await params;
  const context = await requireAdminContext();
  const currencySettings = await getOrganizationCurrencySettings(
    context.organizationId,
  );
  const [property, ownerOptions] = await Promise.all([
    getPropertyDetail(context.organizationId, propertyId, currencySettings),
    getPropertyOwnerOptions(context.organizationId),
  ]);

  if (!property) {
    notFound();
  }

  return (
    <PropertyDetailScreen ownerOptions={ownerOptions} property={property} />
  );
}
