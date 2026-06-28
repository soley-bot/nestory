import { LeaseScreen } from "@/features/leases/components/lease-screen";
import { getLeasesScreenData } from "@/features/leases/data/leases";
import { parseLeaseSearchParams } from "@/features/leases/lease.filters";
import { requireAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type LeasesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeasesPage({ searchParams }: LeasesPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const viewQuery = parseLeaseSearchParams(params);
  const { leases, pagination, propertyOptions, tenantOptions, unitOptions } =
    await getLeasesScreenData(context.organizationId, viewQuery);
  const initialLeaseId = getUuidSearchParam(params.leaseId);

  return (
    <LeaseScreen
      key={initialLeaseId ?? "leases"}
      initialLeaseId={initialLeaseId}
      leases={leases}
      pagination={pagination}
      propertyOptions={propertyOptions}
      tenantOptions={tenantOptions}
      unitOptions={unitOptions}
      viewQuery={viewQuery}
    />
  );
}
