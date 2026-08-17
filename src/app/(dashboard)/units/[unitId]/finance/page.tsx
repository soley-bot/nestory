import { notFound } from "next/navigation";
import {
  FinanceOperationsScreen,
  type FinanceOperationsView,
} from "@/features/finance-operations/components/finance-operations-screen";
import {
  getFinanceOperationsData,
  scopeFinanceOperationsData,
} from "@/features/finance-operations/data/finance-operations";
import { getUnitDetail } from "@/features/units/data/units";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function UnitFinancePage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ unitId: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const [{ unitId }, query, context] = await Promise.all([
    params,
    searchParams,
    requireFinanceContext(),
  ]);
  const unit = await getUnitDetail(context.organizationId, unitId);
  if (!unit) notFound();
  const allData = await getFinanceOperationsData(
    context.organizationId,
    unit.propertyId,
  );
  const data = scopeFinanceOperationsData(allData, {
    propertyId: unit.propertyId,
    unitId,
  });

  return (
    <FinanceOperationsScreen
      {...data}
      canConfigureRent={context.capabilities.canConfigureLeases}
      canCorrectFinance={context.capabilities.canCorrectFinance}
      canRecordOwnerCash={false}
      canRecordPayments={context.capabilities.canOperateFinance}
      canReadFinanceReports={context.capabilities.canReadFinanceReports}
      canRecoverRent={context.capabilities.canConfigureLeases}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canRetryCurrentRent={context.capabilities.canRetryCurrentRent}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      organizationName={context.organizationName}
      scope={{
        id: unitId,
        kind: "unit",
        label: unit.unitNumber,
        propertyId: unit.propertyId,
        propertyLabel: unit.propertyName,
      }}
      selectedPropertyId={unit.propertyId}
      view={unitFinanceView(query.view)}
    />
  );
}

function unitFinanceView(view?: string): FinanceOperationsView {
  return view === "expenses" ? "expenses" : "rent";
}
