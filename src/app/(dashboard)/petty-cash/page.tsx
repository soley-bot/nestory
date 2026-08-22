import { PettyCashScreen } from "@/features/petty-cash/components/petty-cash-screen";
import { getPettyCashScreenData } from "@/features/petty-cash/data/petty-cash";
import { requireFinanceContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type PettyCashPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PettyCashPage({
  searchParams,
}: PettyCashPageProps) {
  const context = await requireFinanceContext();
  const params = await searchParams;
  const data = await getPettyCashScreenData(
    context.organizationId,
    {
      focusedEntryId: getUuidSearchParam(params.entryId),
      selectedAccountId: getUuidSearchParam(params.accountId),
    },
  );

  return (
    <PettyCashScreen
      {...data}
      canAdministerAccounts={context.isSuperAdmin}
      canApproveExpenses={context.permissionKeys.has("finance.approve_expenses")}
      canCorrectFinance={context.permissionKeys.has("finance.correct_records")}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canSubmitExpenses={context.permissionKeys.has("finance.submit_expenses")}
    />
  );
}
