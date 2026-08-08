import { LeaseScreen } from "@/features/leases/components/lease-screen";
import { getLeasesScreenData } from "@/features/leases/data/leases";
import { parseLeaseSearchParams } from "@/features/leases/lease.filters";
import { requireFinanceContext } from "@/lib/auth/context";

type LeasesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeasesPage({ searchParams }: LeasesPageProps) {
  const context = await requireFinanceContext();
  const params = await searchParams;
  const viewQuery = parseLeaseSearchParams(params);
  const { leases, pagination, propertyOptions, tenantOptions, unitOptions } =
    await getLeasesScreenData(context.organizationId, viewQuery);
  const initialLeaseId = viewQuery.leaseId ?? undefined;

  return (
    <LeaseScreen
      canConfigure={context.capabilities.canConfigureLeases}
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
