import type { Metadata } from "next";
import { FinanceAccountsScreen } from "@/features/finance-accounts/components/finance-accounts-screen";
import { getFinanceAccountsData } from "@/features/finance-accounts/data/finance-accounts";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function FinanceAccountsPage() {
  const context = await requireFinanceContext();
  const data = await getFinanceAccountsData(context.organizationId);

  return (
    <FinanceAccountsScreen
      {...data}
      canManageAccounts={context.isSuperAdmin}
      navigation={context.capabilities}
    />
  );
}

export const metadata: Metadata = { title: "Finance accounts" };
