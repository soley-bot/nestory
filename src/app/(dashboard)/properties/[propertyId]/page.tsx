import { notFound } from "next/navigation";
import { PropertyDetailScreen } from "@/features/properties/components/property-detail-screen";
import {
  getPropertyDetail,
  getPropertyOwnerOptions,
} from "@/features/properties/data/properties";
import { requireAdminContext } from "@/lib/auth/context";

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
    notFound();
  }

  return (
    <PropertyDetailScreen ownerOptions={ownerOptions} property={property} />
  );
}
