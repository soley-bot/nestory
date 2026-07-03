import { PettyCashScreen } from "@/features/petty-cash/components/petty-cash-screen";
import { getPettyCashScreenData } from "@/features/petty-cash/data/petty-cash";
import { requireAdminContext } from "@/lib/auth/context";

export default async function PettyCashPage() {
  const context = await requireAdminContext();
  const data = await getPettyCashScreenData(context.organizationId);

  return <PettyCashScreen {...data} />;
}
