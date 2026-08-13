import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { RentPolicyScreen } from "@/features/leases/components/rent-policy-screen";
import { getRentPolicyVersions } from "@/features/leases/data/rent-policy";
import { requireLeaseConfigurationContext } from "@/lib/auth/context";

export default async function RentPolicyPage() {
  const context = await requireLeaseConfigurationContext();
  const versions = await getRentPolicyVersions(context.organizationId);

  return (
    <div>
      <PageHeader
        description="Approve explicit rent rules before leases become rent-ready."
        navigation={
          context.role === "super_admin" ? (
            <SettingsTabs activeHref="/settings/rent-policy" />
          ) : undefined
        }
        title="Rent policy"
      />
      <RentPolicyScreen versions={versions} />
    </div>
  );
}
