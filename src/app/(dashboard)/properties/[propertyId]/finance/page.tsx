import { notFound } from "next/navigation";
import {
  FinanceOperationsScreen,
  type FinanceOperationsView,
} from "@/features/finance-operations/components/finance-operations-screen";
import {
  getFinanceOperationsData,
  scopeFinanceOperationsData,
} from "@/features/finance-operations/data/finance-operations";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function PropertyFinancePage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ propertyId: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const [{ propertyId }, query, context] = await Promise.all([
    params,
    searchParams,
    requireFinanceContext(),
  ]);
  const allData = await getFinanceOperationsData(context.organizationId, propertyId);
  const property = allData.propertyOptions.find((option) => option.id === propertyId);
  if (!property) notFound();
  const data = scopeFinanceOperationsData(allData, { propertyId });
  const view = propertyFinanceView(query.view);

  return (
    <FinanceOperationsScreen
      {...data}
      canConfigureRent={context.capabilities.canConfigureLeases}
      canCorrectFinance={context.capabilities.canCorrectFinance}
      canRecordOwnerCash={context.capabilities.canOperateFinance}
      canRecordPayments={context.capabilities.canOperateFinance}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canRecoverRent={context.capabilities.canRecoverHistoricalRent}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canRetryCurrentRent={context.capabilities.canRetryCurrentRent}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      organizationName={context.organizationName}
      scope={{
        id: propertyId,
        kind: "property",
        label: property.label,
        propertyId,
        propertyLabel: property.label,
      }}
      selectedPropertyId={propertyId}
      view={view}
    />
  );
}

function propertyFinanceView(view?: string): FinanceOperationsView {
  if (view === "expenses") return "expenses";
  if (view === "owner") return "account";
  return "rent";
}
