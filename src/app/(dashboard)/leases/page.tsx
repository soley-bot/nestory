import { LeaseScreen } from "@/features/leases/components/lease-screen";
import { getLeasesScreenData } from "@/features/leases/data/leases";
import { parseLeaseSearchParams } from "@/features/leases/lease.filters";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import { requireAdminContext } from "@/lib/auth/context";

type LeasesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeasesPage({ searchParams }: LeasesPageProps) {
  const context = await requireAdminContext();
  const viewQuery = parseLeaseSearchParams(await searchParams);
  const currencySettings = await getOrganizationCurrencySettings(
    context.organizationId,
  );
  const { leases, pagination, propertyOptions, unitOptions } =
    await getLeasesScreenData(
      context.organizationId,
      currencySettings,
      viewQuery,
    );

  return (
    <LeaseScreen
      leases={leases}
      pagination={pagination}
      propertyOptions={propertyOptions}
      unitOptions={unitOptions}
      viewQuery={viewQuery}
    />
  );
}
