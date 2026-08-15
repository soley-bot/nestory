import { SettingsShell } from "@/components/layout/settings-shell";
import { RentPolicyScreen } from "@/features/leases/components/rent-policy-screen";
import { getRentPolicyVersions } from "@/features/leases/data/rent-policy";
import { requireLeaseConfigurationContext } from "@/lib/auth/context";

export default async function RentPolicyPage() {
  const context = await requireLeaseConfigurationContext();
  const versions = await getRentPolicyVersions(context.organizationId);

  return (
    <SettingsShell activeHref="/settings/rent-policy" role={context.role}>
      <RentPolicyScreen versions={versions} />
    </SettingsShell>
  );
}
