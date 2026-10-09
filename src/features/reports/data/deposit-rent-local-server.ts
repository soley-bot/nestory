import "server-only";
import { getCurrentUser, getFinanceReportMembershipForUser } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permission-context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createLocalDepositExportHandler } from "./deposit-rent-local-export";
import type { LocalDepositClient } from "./deposit-rent-local-source";

// Concrete ordinary-session binding; not mounted in app/ and always disabled.
// No new endpoint, execution grant, finance-only read or service credentials.
export async function getLocalDepositMembership(userId: string) {
    const membership = await getFinanceReportMembershipForUser(userId);
    if (!membership || !hasPermission(membership.permissionContext, "leases.view")
      || !hasPermission(membership.permissionContext, "finance.view")) return null;
    return { organizationId: membership.organizationId, organizationName: membership.organizationName,
      authorizationKey: JSON.stringify([membership.branchId, membership.roleId, [...membership.permissionContext.permissionKeys].sort()]) };
}
export const handleDisabledLocalDepositExport = createLocalDepositExportHandler({
  currentUser: getCurrentUser,
  membership: getLocalDepositMembership,
  client: async () => await createSupabaseServerClient() as unknown as LocalDepositClient,
});
