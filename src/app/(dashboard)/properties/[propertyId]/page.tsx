import { PropertyDetailScreen } from "@/features/properties/components/property-detail-screen";
import {
  getPropertyDetail,
  getPropertyOwnerOptions,
} from "@/features/properties/data/properties";
import { requirePermission } from "@/lib/auth/context";
import { getPersonSelectOptions } from "@/features/people/data/person-options";
import { getLeaseBillingFormConfig } from "@/features/leases/data/leases";
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
  const [property, ownerOptions, tenantOptions, billingFormConfig] = await Promise.all([
    getPropertyDetail(context.organizationId, propertyId),
    getPropertyOwnerOptions(context.organizationId),
    getPersonSelectOptions({
      organizationId: context.organizationId,
      roles: ["tenant"],
    }),
    getLeaseBillingFormConfig(context.organizationId),
  ]);

  if (!property) {
    return <PropertyNotFound />;
  }

  return (
    <>
    <ReportReturnNavigation returnTo={returnTo} />
    <PropertyDetailScreen
      canArchive={context.permissionKeys.has("properties.archive")}
      billingFormConfig={billingFormConfig}
      canCreateLease={context.permissionKeys.has("leases.prepare")}
      canRecordDepositReceipt={context.permissionKeys.has("leases.change_terms")}
      canWrite={context.permissionKeys.has("properties.write")}
      initialSection={getInitialPropertySection(section)}
      ownerOptions={ownerOptions}
      property={property}
      tenantOptions={tenantOptions}
    />
    </>
  );
}

function getInitialPropertySection(section?: string) {
  return section === "units" || section === "maintenance" || section === "files"
    ? section
    : "overview";
}
