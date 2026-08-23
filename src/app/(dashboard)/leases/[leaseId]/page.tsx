import { LeaseDetailScreen } from "@/features/leases/components/lease-detail-screen";
import { getLeasesScreenData } from "@/features/leases/data/leases";
import { parseLeaseSearchParams } from "@/features/leases/lease.filters";
import { parseLeaseDetailQuery } from "@/features/leases/lease-detail-route";
import { requirePermission } from "@/lib/auth/context";
import LeaseNotFound from "./not-found";

type LeasePageProps = {
  params: Promise<{ leaseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeasePage({ params, searchParams }: LeasePageProps) {
  const [{ leaseId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const context = await requirePermission("leases.view");
  const { section } = parseLeaseDetailQuery(rawSearchParams);
  const viewQuery = {
    ...parseLeaseSearchParams({ archiveState: "all" }),
    leaseId,
  };
  const {
    billingFormConfig,
    leases,
    propertyOptions,
    tenantOptions,
    unitOptions,
  } =
    await getLeasesScreenData(context.organizationId, viewQuery);
  const lease = leases[0];

  if (!lease || lease.id !== leaseId) {
    return <LeaseNotFound />;
  }

  return (
    <LeaseDetailScreen
      activeSection={section}
      billingFormConfig={billingFormConfig}
      permissions={{
        canActivate: context.permissionKeys.has("leases.activate"),
        canArchive: context.permissionKeys.has("leases.archive"),
        canChangeTerms: context.permissionKeys.has("leases.change_terms"),
        canClose: context.permissionKeys.has("leases.close"),
        canPrepare: context.permissionKeys.has("leases.prepare"),
      }}
      lease={lease}
      propertyOptions={propertyOptions}
      tenantOptions={tenantOptions}
      unitOptions={unitOptions}
    />
  );
}
