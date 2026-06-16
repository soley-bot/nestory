import { LedgerScreen } from "@/features/ledger/components/ledger-screen";
import { getLedgerScreenData } from "@/features/ledger/data/ledger";
import { requireAdminContext } from "@/lib/auth/context";
import { getUuidSearchParam } from "@/lib/validation/search-params";

type LedgerPageProps = {
  searchParams: Promise<{ entryId?: string | string[] }>;
};

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const context = await requireAdminContext();
  const { entryId } = await searchParams;
  const data = await getLedgerScreenData(context.organizationId);

  return <LedgerScreen {...data} initialEntryId={getUuidSearchParam(entryId)} />;
}
