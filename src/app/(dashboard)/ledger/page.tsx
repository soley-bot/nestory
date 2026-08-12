import { LedgerScreen } from "@/features/ledger/components/ledger-screen";
import { getLedgerScreenData } from "@/features/ledger/data/ledger";
import { parseLedgerSearchParams } from "@/features/ledger/ledger.filters";
import { requireFinanceContext } from "@/lib/auth/context";

type LedgerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const context = await requireFinanceContext();
  const params = await searchParams;
  const query = parseLedgerSearchParams(params);
  const data = await getLedgerScreenData(context.organizationId, query);

  return (
    <LedgerScreen
      {...data}
      canLockFinancialMonth={context.capabilities.canLockFinancialMonth}
      canManageFinance={context.capabilities.canManageFinanceOperations}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canUnlockFinancialMonth={context.capabilities.canUnlockFinancialMonth}
      initialEntryId={query.entryId ?? undefined}
    />
  );
}
