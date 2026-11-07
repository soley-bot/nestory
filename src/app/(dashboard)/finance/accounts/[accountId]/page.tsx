import type { Metadata } from "next";
import { activityPeriodError } from "@/features/finance-accounts/activity-period";
import { notFound } from "next/navigation";
import { FinanceAccountActivityScreen } from "@/features/finance-accounts/components/finance-account-activity-screen";
import { getFinanceAccountActivity } from "@/features/finance-accounts/data/finance-account-activity";
import { requireFinanceContext } from "@/lib/auth/context";
import { getBusinessDateValue } from "@/lib/dates/business-date";

type PageProps = {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ from?: string; propertyId?: string; to?: string }>;
};

export default async function FinanceAccountActivityPage({ params, searchParams }: PageProps) {
  const context = await requireFinanceContext();
  const [{ accountId }, query] = await Promise.all([params, searchParams]);
  const today = getBusinessDateValue(new Date(), context.operationalTimezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const filters = { periodStart: query.from ?? monthStart, periodEnd: query.to ?? today };
  const filterError = activityPeriodError(filters.periodStart, filters.periodEnd);
  const activity = await getFinanceAccountActivity(context.organizationId, accountId, {
    periodEnd: filterError ? today : filters.periodEnd,
    periodStart: filterError ? monthStart : filters.periodStart,
    ...(query.propertyId && query.propertyId !== "all" ? { propertyId: query.propertyId } : {}),
  });
  if (!activity) notFound();
  return <FinanceAccountActivityScreen activity={activity} attemptedFilters={filters} filterError={filterError} navigation={context.capabilities} />;
}

export const metadata: Metadata = { title: "Finance account activity" };
