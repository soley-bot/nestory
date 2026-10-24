import { PropertyDetailScreen } from "@/features/properties/components/property-detail-screen";
import { getPropertyDetail } from "@/features/properties/data/properties";
import { requirePermission } from "@/lib/auth/context";
import PropertyNotFound from "./not-found";
import { ReportReturnNavigation } from "@/features/reports/components/report-return-navigation";

type PropertyPageProps = {
  params: Promise<{ propertyId: string }>;
  searchParams?: Promise<{ section?: string; returnTo?: string }>;
};

export default async function PropertyPage({
  params,
  searchParams = Promise.resolve({}),
}: PropertyPageProps) {
  const { propertyId } = await params;
  const { section, returnTo } = await searchParams;
  const context = await requirePermission("properties.view");
  const property = await getPropertyDetail(context.organizationId, propertyId, { operationalTimezone: context.operationalTimezone });

  if (!property) {
    return <PropertyNotFound />;
  }

  return (
    <>
    <ReportReturnNavigation returnTo={returnTo} />
    <PropertyDetailScreen
      returnTo={returnTo}
      canArchive={context.permissionKeys.has("properties.archive")}
      canCreateLease={context.permissionKeys.has("leases.prepare")}
      canRecordDepositReceipt={context.permissionKeys.has("leases.change_terms")}
      canWrite={context.permissionKeys.has("properties.write")}
      initialSection={getInitialPropertySection(section)}
      property={property}
    />
    </>
  );
}

function getInitialPropertySection(section?: string) {
  return section === "units" || section === "maintenance" || section === "files"
    ? section
    : "overview";
}
