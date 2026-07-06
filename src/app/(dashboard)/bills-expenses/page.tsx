import { BillsExpensesScreen } from "@/features/bills-expenses/components/bills-expenses-screen";
import { getBillsExpensesScreenData } from "@/features/bills-expenses/data/bills-expenses";
import { parseBillsExpensesSearchParams } from "@/features/bills-expenses/bills-expenses.filters";
import { requireAdminContext } from "@/lib/auth/context";

type BillsExpensesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BillsExpensesPage({
  searchParams,
}: BillsExpensesPageProps) {
  const context = await requireAdminContext();
  const params = (await searchParams) ?? {};
  const viewQuery = parseBillsExpensesSearchParams(params);
  const data = await getBillsExpensesScreenData(
    context.organizationId,
    viewQuery,
  );

  return <BillsExpensesScreen {...data} />;
}
