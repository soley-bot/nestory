import { OverviewScreen } from "@/features/overview/components/overview-screen";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { buildOverviewHref, firstOverviewMonth, formatOverviewMonth, parseOverviewSearchParams } from "@/features/overview/overview.filters";
import { getFinancialWriteContext } from "@/lib/finance/financial-write-context.server";
import Link from "next/link";
import { buildAdminWorkspaceQueue } from "@/features/workspace-operations/admin-workspace";
import { requireSuperAdminContext } from "@/lib/auth/context";

type OverviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const context = await requireSuperAdminContext();
  const query = parseOverviewSearchParams(await searchParams);
  const financialContext = await getFinancialWriteContext(context.organizationId);
  const firstMonth = firstOverviewMonth(financialContext.financial_start_date);
  if (firstMonth && query.month < firstMonth) {
    return <main className="workspace-gutter-x py-8">
      <h1 className="text-lg font-semibold">This reporting month is unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">Reporting is available from {formatOverviewMonth(firstMonth)}. Choose an available month to view this workspace.</p>
      <Link className="mt-4 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href={buildOverviewHref(query, { month: firstMonth })}>Open {formatOverviewMonth(firstMonth)}</Link>
    </main>;
  }
  const data = await getOverviewScreenData(context.organizationId, query);
  const attentionQueue = buildAdminWorkspaceQueue(data);

  return (
    <OverviewScreen
      attentionQueue={attentionQueue}
      data={data}
      query={query}
    />
  );
}
