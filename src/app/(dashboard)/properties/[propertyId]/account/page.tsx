import { notFound } from "next/navigation";
import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireFinanceContext } from "@/lib/auth/context";

export default async function PropertyAccountPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const context = await requireFinanceContext();
  const data = await getFinanceOperationsData(
    context.organizationId,
    propertyId,
  );
  if (!data.positions.some((position) => position.propertyId === propertyId))
    notFound();
  return (
    <FinanceOperationsScreen
      {...data}
      canConfigureRent={context.capabilities.canConfigureLeases}
      canManageFinance={context.capabilities.canManageFinanceOperations}
      canRecoverRent={context.capabilities.canConfigureLeases}
      canReviewExpense={context.capabilities.canReviewExpense}
      canReverseExpense={context.capabilities.canReverseExpense}
      canSubmitExpense={context.capabilities.canSubmitExpense}
      organizationName={context.organizationName}
      selectedPropertyId={propertyId}
      view="account"
    />
  );
}
