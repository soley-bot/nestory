import { LedgerScreen } from "@/features/ledger/components/ledger-screen";
import { getLedgerScreenData } from "@/features/ledger/data/ledger";
import { requireAdminContext } from "@/lib/auth/context";

export default async function LedgerPage() {
  const context = await requireAdminContext();
  const data = await getLedgerScreenData(context.organizationId);

  return <LedgerScreen {...data} />;
}
