import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { OpeningBalanceScreen } from "@/features/owner-balances/components/opening-balance-screen";
import { getOpeningBalanceAuthorityData } from "@/features/owner-balances/data/opening-balances";
import { requireFinanceContext } from "@/lib/auth/context";
import { getBusinessMonthValue } from "@/lib/dates/business-date";

type BalancesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BalancesPage({ searchParams }: BalancesPageProps = {}) {
  const context = await requireFinanceContext();
  const query = (await searchParams) ?? {};
  const selectedMonth = validMonth(first(query.month)) ?? getBusinessMonthValue();
  const selectedPropertyId = validUuid(first(query.propertyId));
  const selectedOwnerPersonId = validUuid(first(query.ownerPersonId));
  const [data, openingData] = await Promise.all([
    getFinanceOperationsData(context.organizationId),
    getOpeningBalanceAuthorityData({
      currency: "USD",
      effectiveDate: `${selectedMonth}-01`,
      ownerPersonId: selectedOwnerPersonId,
      propertyId: selectedPropertyId,
    }),
  ]);
  return (
    <FinanceOperationsScreen
      {...data}
      canConfigureRent={context.capabilities.canConfigureLeases}
      canCorrectFinance={context.capabilities.canCorrectFinance}
      canRecordOwnerCash={context.capabilities.canOperateFinance}
      canRecordPayments={context.capabilities.canOperateFinance}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canRecoverRent={context.capabilities.canConfigureLeases}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canRetryCurrentRent={context.capabilities.canRetryCurrentRent}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      openingAuthority={
        <OpeningBalanceScreen
          actorUserId={context.userId}
          canReview={context.capabilities.canReviewOwnerOpeningBalance}
          canSubmitCorrection={context.capabilities.canRequestOwnerOpeningBalanceCorrection}
          canSubmitInitial={context.capabilities.canSubmitOwnerOpeningBalance}
          data={openingData}
          isSuperAdmin={context.role === "super_admin"}
          ownerOptions={data.peopleOptions}
          propertyOptions={data.propertyOptions}
          selectedMonth={selectedMonth}
          selectedOwnerPersonId={selectedOwnerPersonId}
          selectedPropertyId={selectedPropertyId}
        />
      }
      organizationName={context.organizationName}
      view="balances"
    />
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validMonth(value: string | undefined) {
  return value && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) ? value : undefined;
}

function validUuid(value: string | undefined) {
  return value && UUID_PATTERN.test(value) ? value : undefined;
}
