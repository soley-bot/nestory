import { OwnerBalanceLedger, OwnerSourceResolution } from "@/features/owner-balances/components/owner-balance-ledger";
import { getOwnerBalanceData } from "@/features/owner-balances/data/owner-balances";
import { OpeningBalanceScreen } from "@/features/owner-balances/components/opening-balance-screen";
import { getOpeningBalanceAuthorityData } from "@/features/owner-balances/data/opening-balances";
import { OwnerCloseScreen } from "@/features/owner-close/components/owner-close-screen";
import { getOwnerCloseData } from "@/features/owner-close/data/owner-close";
import { requireFinanceContext } from "@/lib/auth/context";
import { getBusinessMonthValue } from "@/lib/dates/business-date";
import { parseOwnerAccountView } from "@/features/owner-balances/owner-account-view";
import { ReportReturnNavigation } from "@/features/reports/components/report-return-navigation";
import { reportReturnHref, withReportReturn } from "@/features/reports/report-return";

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
  const selectedView = parseOwnerAccountView(first(query.view));
  const originReportHref = reportReturnHref(first(query.returnTo));
  const accountReturnHref = withReportReturn(`/balances?${new URLSearchParams({ month: selectedMonth, view: selectedView, propertyId: selectedPropertyId ?? "", ownerPersonId: selectedOwnerPersonId ?? "" })}`, originReportHref);
  const registerPage = positiveInteger(first(query.page)) ?? 1;
  const periodStart = `${selectedMonth}-01`;
  const [data, openingData, closeData] = await Promise.all([
    getOwnerBalanceData({
      currency: "USD",
      ownerPersonId: selectedOwnerPersonId,
      periodEnd: periodStart,
      periodStart,
      propertyId: selectedPropertyId,
      registerPage,
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
  const openingAuthority = (
        <OpeningBalanceScreen
          key={`${selectedPropertyId}:${selectedOwnerPersonId}:${selectedMonth}`}
          returnTo={accountReturnHref}
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
  );
  return (
    <>
    <ReportReturnNavigation returnTo={originReportHref} />
    <OwnerBalanceLedger
      originReportHref={originReportHref}
      canAllocate={context.capabilities.canOperateFinance}
      canGenerate={context.capabilities.canCloseOwnerMonth}
      canCorrect={context.capabilities.canCorrectFinance}
      canTransfer={context.role === "super_admin"}
      canResolveOwnership={
        context.permissionKeys.has("properties.view") &&
        context.permissionKeys.has("properties.write")
      }
      canViewPropertyRecords={context.permissionKeys.has("properties.view")}
      closingAuthority={
        <OwnerCloseScreen
          key={`${selectedPropertyId}:${selectedOwnerPersonId}:${periodStart}`}
          canClose={context.capabilities.canCloseOwnerMonth}
          canLockMonth={context.capabilities.canLockFinancialMonth}
          openingAuthority={openingAuthority}
          sourceAuthority={<OwnerSourceResolution returnTo={accountReturnHref} data={data} canAllocate={context.capabilities.canOperateFinance} canResolveOwnership={context.permissionKeys.has("properties.view") && context.permissionKeys.has("properties.write")} />}
          canPublish={context.capabilities.canPublishOwnerStatement}
          canReopen={context.capabilities.canReopenOwnerMonth}
          data={closeData}
          monthStart={periodStart}
          ownerPersonId={selectedOwnerPersonId}
          propertyId={selectedPropertyId}
          presentation={selectedView === "statements" ? "statements" : "close"}
        />
      }
      data={data}
      openingAuthority={
        openingAuthority
      }
      organizationName={context.organizationName}
      selectedMonth={selectedMonth}
      selectedOwnerPersonId={selectedOwnerPersonId}
      selectedPropertyId={selectedPropertyId}
      selectedView={selectedView}
    />
    </>
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

function positiveInteger(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
