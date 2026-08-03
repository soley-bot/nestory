import { notFound } from "next/navigation";
import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireAdminContext } from "@/lib/auth/context";

export default async function PropertyAccountPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const context = await requireAdminContext();
  const data = await getFinanceOperationsData(
    context.organizationId,
    propertyId,
  );
  if (!data.positions.some((position) => position.propertyId === propertyId))
    notFound();
  return (
    <FinanceOperationsScreen
      {...data}
      organizationName={context.organizationName}
      selectedPropertyId={propertyId}
      view="account"
    />
  );
}
