import { PropertyDetailScreen } from "@/features/properties/components/property-detail-screen";
import {
  getPropertyDetail,
  getPropertyOwnerOptions,
} from "@/features/properties/data/properties";
import { requireAdminContext } from "@/lib/auth/context";
import PropertyNotFound from "./not-found";

type PropertyPageProps = {
  params: Promise<{ propertyId: string }>;
};

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { propertyId } = await params;
  const context = await requireAdminContext();
  const [property, ownerOptions] = await Promise.all([
    getPropertyDetail(context.organizationId, propertyId),
    getPropertyOwnerOptions(context.organizationId),
  ]);

  if (!property) {
    return <PropertyNotFound />;
  }

  return (
    <PropertyDetailScreen ownerOptions={ownerOptions} property={property} />
  );
}
