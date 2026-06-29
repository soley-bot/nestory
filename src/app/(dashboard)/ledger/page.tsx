import { LedgerScreen } from "@/features/ledger/components/ledger-screen";
import { getLedgerScreenData } from "@/features/ledger/data/ledger";
import { parseLedgerSearchParams } from "@/features/ledger/ledger.filters";
import { requireAdminContext } from "@/lib/auth/context";

type LedgerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const context = await requireAdminContext();
  const params = await searchParams;
  const query = parseLedgerSearchParams(params);
  const data = await getLedgerScreenData(context.organizationId, query);

  return <LedgerScreen {...data} initialEntryId={query.entryId ?? undefined} />;
}
