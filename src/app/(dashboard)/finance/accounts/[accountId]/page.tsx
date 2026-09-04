import { notFound } from "next/navigation";
import { FinanceAccountActivityScreen } from "@/features/finance-accounts/components/finance-account-activity-screen";
import { getFinanceAccountActivity } from "@/features/finance-accounts/data/finance-account-activity";
import { requireFinanceContext } from "@/lib/auth/context";

type PageProps = {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ from?: string; propertyId?: string; to?: string }>;
};

export default async function FinanceAccountActivityPage({ params, searchParams }: PageProps) {
  const context = await requireFinanceContext();
  const [{ accountId }, query] = await Promise.all([params, searchParams]);
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const activity = await getFinanceAccountActivity(context.organizationId, accountId, {
    periodEnd: validDate(query.to) ?? today,
    periodStart: validDate(query.from) ?? monthStart,
    ...(query.propertyId && query.propertyId !== "all" ? { propertyId: query.propertyId } : {}),
  });
  if (!activity) notFound();
  return <FinanceAccountActivityScreen activity={activity} />;
}

function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}
