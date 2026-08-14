import { PropertyDetailScreen } from "@/features/properties/components/property-detail-screen";
import {
  getPropertyDetail,
  getPropertyOwnerOptions,
} from "@/features/properties/data/properties";
import { requireSuperAdminContext } from "@/lib/auth/context";
import PropertyNotFound from "./not-found";

type PropertyPageProps = {
  params: Promise<{ propertyId: string }>;
  searchParams?: Promise<{ section?: string }>;
};

export default async function PropertyPage({
  params,
  searchParams = Promise.resolve({}),
}: PropertyPageProps) {
  const { propertyId } = await params;
  const { section } = await searchParams;
  const context = await requireSuperAdminContext();
  const [property, ownerOptions] = await Promise.all([
    getPropertyDetail(context.organizationId, propertyId),
    getPropertyOwnerOptions(context.organizationId),
  ]);

  if (!property) {
    return <PropertyNotFound />;
  }

  return (
    <PropertyDetailScreen
      initialSection={getInitialPropertySection(section)}
      ownerOptions={ownerOptions}
      property={property}
    />
  );
}

function getInitialPropertySection(section?: string) {
  return section === "units" || section === "maintenance" || section === "files"
    ? section
    : "overview";
}
