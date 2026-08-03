import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireAdminContext } from "@/lib/auth/context";

export default async function FinanceOperationsReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireAdminContext();
  const params = (await searchParams) ?? {};
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const data = await getFinanceOperationsData(context.organizationId);
  return (
    <FinanceOperationsScreen
      {...data}
      organizationName={context.organizationName}
      reportView={rawView === "ips" ? "ips" : "owner"}
      view="reports"
    />
  );
}
