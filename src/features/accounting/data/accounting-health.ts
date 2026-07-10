import type { AccountingPostingHealth } from "@/features/accounting/accounting.types";
import { createSupabaseServerClient } from "@/lib/db/server";

export function mapAccountingPostingHealth({
  linkedCount,
  totalCount,
}: {
  linkedCount: number | null;
  totalCount: number | null;
}): AccountingPostingHealth {
  const normalizedTotal = Math.max(0, totalCount ?? 0);
  const normalizedLinked = Math.min(
    normalizedTotal,
    Math.max(0, linkedCount ?? 0),
  );

  return {
    linkedCount: normalizedLinked,
    unlinkedCount: Math.max(0, normalizedTotal - normalizedLinked),
  };
}

export async function getAccountingPostingHealth({
  organizationId,
}: {
  organizationId: string;
}): Promise<AccountingPostingHealth> {
  const supabase = await createSupabaseServerClient();
  const [totalResult, linkedResult] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .not("accounting_journal_entry_id", "is", null),
  ]);

  if (totalResult.error) {
    throw new Error(
      `Could not load accounting ledger count: ${totalResult.error.message}`,
    );
  }

  if (linkedResult.error) {
    throw new Error(
      `Could not load linked accounting journal count: ${linkedResult.error.message}`,
    );
  }

  return mapAccountingPostingHealth({
    linkedCount: linkedResult.count,
    totalCount: totalResult.count,
  });
}
