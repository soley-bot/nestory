import { OwnerBalanceLedger } from "@/features/owner-balances/components/owner-balance-ledger";
import { getOwnerBalanceData } from "@/features/owner-balances/data/owner-balances";
import { OpeningBalanceScreen } from "@/features/owner-balances/components/opening-balance-screen";
import { getOpeningBalanceAuthorityData } from "@/features/owner-balances/data/opening-balances";
import { OwnerCloseScreen } from "@/features/owner-close/components/owner-close-screen";
import { getOwnerCloseData } from "@/features/owner-close/data/owner-close";
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
  const periodStart = `${selectedMonth}-01`;
  const [data, openingData, closeData] = await Promise.all([
    getOwnerBalanceData({
      currency: "USD",
      ownerPersonId: selectedOwnerPersonId,
      periodEnd: periodStart,
      periodStart,
      propertyId: selectedPropertyId,
    }),
    getOpeningBalanceAuthorityData({
      currency: "USD",
      effectiveDate: periodStart,
      ownerPersonId: selectedOwnerPersonId,
      propertyId: selectedPropertyId,
    }),
    getOwnerCloseData({
      currency: "USD",
      monthStart: periodStart,
      ownerPersonId: selectedOwnerPersonId,
      propertyId: selectedPropertyId,
    }),
  ]);
  return (
    <OwnerBalanceLedger
      canAllocate={context.capabilities.canOperateFinance}
      canCorrect={context.capabilities.canCorrectFinance}
      canTransfer={context.role === "super_admin"}
      closingAuthority={
        <OwnerCloseScreen
          canClose={context.capabilities.canCloseOwnerMonth}
          canReopen={context.capabilities.canReopenOwnerMonth}
          data={closeData}
          monthStart={periodStart}
          ownerPersonId={selectedOwnerPersonId}
          propertyId={selectedPropertyId}
        />
      }
      data={data}
      openingAuthority={
        <OpeningBalanceScreen
          actorUserId={context.userId}
          canReview={context.capabilities.canReviewOwnerOpeningBalance}
          canSubmitCorrection={context.capabilities.canRequestOwnerOpeningBalanceCorrection}
          canSubmitInitial={context.capabilities.canSubmitOwnerOpeningBalance}
          data={openingData}
          isSuperAdmin={context.role === "super_admin"}
          ownerOptions={data.ownerOptions}
          propertyOptions={data.propertyOptions}
          selectedMonth={selectedMonth}
          selectedOwnerPersonId={selectedOwnerPersonId}
          selectedPropertyId={selectedPropertyId}
        />
      }
      organizationName={context.organizationName}
      selectedMonth={selectedMonth}
      selectedOwnerPersonId={selectedOwnerPersonId}
      selectedPropertyId={selectedPropertyId}
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
