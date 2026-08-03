import { PageHeader } from "@/components/layout/page-header";
import { RentPolicyScreen } from "@/features/leases/components/rent-policy-screen";
import { getRentPolicyVersions } from "@/features/leases/data/rent-policy";
import { requireAdminContext } from "@/lib/auth/context";

export default async function RentPolicyPage() {
  const context = await requireAdminContext();
  const versions = await getRentPolicyVersions(context.organizationId);

  return (
    <div>
      <PageHeader
        description="Approve explicit rent rules before leases become rent-ready."
        title="Rent policy"
      />
      <RentPolicyScreen versions={versions} />
    </div>
  );
}
