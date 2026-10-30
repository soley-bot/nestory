import { FinanceAccountRegister } from "@/features/finance-accounts/components/finance-account-register";
import { getFinanceAccountRegisterData } from "@/features/finance-accounts/data/finance-accounts";
import { parseFinanceAccountQuery } from "@/features/finance-accounts/finance-account-query";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function FinanceAccountsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const context = await requireFinanceContext();
  const query = parseFinanceAccountQuery(await searchParams);
  const data = await getFinanceAccountRegisterData(context.organizationId, query);

  return (
    <FinanceAccountRegister
      {...data}
      query={query}
      canManageAccounts={context.isSuperAdmin}
    />
  );
}
