import { notFound } from "next/navigation";
import {
  OwnerBalanceLedger,
  type PropertyAccountActivityFilter,
} from "@/features/owner-balances/components/owner-balance-ledger";
import { getOwnerBalanceData } from "@/features/owner-balances/data/owner-balances";
import { requireFinanceContext } from "@/lib/auth/context";
import { getBusinessMonthValue } from "@/lib/dates/business-date";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PropertyAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { propertyId } = await params;
  const query = (await searchParams) ?? {};
  const selectedMonth = validMonth(first(query.month)) ?? getBusinessMonthValue();
  const requestedOwnerId = validUuid(first(query.ownerPersonId));
  const activityFilter = validActivityFilter(first(query.activity));
  const activityPage = positiveInteger(first(query.page));
  const periodStart = `${selectedMonth}-01`;
  const [context, unscopedData] = await Promise.all([
    requireFinanceContext(),
    getOwnerBalanceData({
      currency: "USD",
      periodEnd: periodStart,
      periodStart,
      propertyId,
    }),
  ]);
  const property = unscopedData.propertyOptions.find((option) => option.id === propertyId);
  if (!property) notFound();

  const selectedOwnerPersonId = requestedOwnerId && unscopedData.ownerOptions.some(
    (owner) => owner.id === requestedOwnerId,
  )
    ? requestedOwnerId
    : unscopedData.ownerOptions.length === 1
      ? unscopedData.ownerOptions[0]?.id
      : undefined;
  const data = selectedOwnerPersonId
    ? await getOwnerBalanceData({
        currency: "USD",
        ownerPersonId: selectedOwnerPersonId,
        periodEnd: periodStart,
        periodStart,
        propertyId,
      })
    : unscopedData;

  return (
    <OwnerBalanceLedger
      canAllocate={context.capabilities.canOperateFinance}
      canCorrect={context.capabilities.canCorrectFinance}
      canTransfer={context.role === "super_admin"}
      data={data}
      organizationName={context.organizationName}
      propertyAccount={{
        activityFilter,
        page: activityPage,
        propertyLabel: property.label,
      }}
      selectedMonth={selectedMonth}
      selectedOwnerPersonId={selectedOwnerPersonId}
      selectedPropertyId={propertyId}
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

function validActivityFilter(
  value: string | undefined,
): PropertyAccountActivityFilter {
  return value === "rent" ||
      value === "owner_cash" ||
      value === "costs" ||
      value === "deposits" ||
      value === "corrections"
    ? value
    : "all";
}

function positiveInteger(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
