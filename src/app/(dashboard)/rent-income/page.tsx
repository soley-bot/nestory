import { FinanceOperationsScreen } from "@/features/finance-operations/components/finance-operations-screen";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";
import { requireAdminContext } from "@/lib/auth/context";

export default async function RentIncomePage() {
  const context = await requireAdminContext();
  const data = await getFinanceOperationsData(context.organizationId);
  return <FinanceOperationsScreen {...data} view="rent" />;
}
