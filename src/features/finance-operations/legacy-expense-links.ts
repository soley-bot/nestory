import type { createSupabaseServerClient } from "@/lib/db/server";
import type { ExpenseSubmissionSummary } from "./finance-operations.types";

type LegacyLink = { submission_id: string; transaction_id: string };

export async function loadLegacyExpenseLinks(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  submissionIds: readonly string[],
  transactionIds: readonly string[],
): Promise<LegacyLink[]> {
  const links = new Map<string, LegacyLink>();
  for (const [column, ids] of [["submission_id", submissionIds], ["transaction_id", transactionIds]] as const) {
    const unique = [...new Set(ids)];
    for (let offset = 0; offset < unique.length; offset += 500) {
      const result = await db.from("expense_legacy_replacements")
        .select("submission_id,transaction_id").eq("organization_id", organizationId)
        .in(column, unique.slice(offset, offset + 500));
      if (result.error) throw new Error("Could not load expense correction links.");
      for (const link of result.data ?? []) links.set(link.submission_id, link);
    }
  }
  return [...links.values()];
}

export function attachLegacyExpenseLinks(
  summaries: ExpenseSubmissionSummary[], links: readonly LegacyLink[],
): ExpenseSubmissionSummary[] {
  const originalLinks = new Map(links.map(link => [link.submission_id, link.transaction_id]));
  const replacementLinks = new Map(links.map(link => [link.transaction_id, link.submission_id]));
  return summaries.map(summary => summary.transactionId
    ? { ...summary, replacesSubmissionId: replacementLinks.get(summary.transactionId) }
    : { ...summary, replacementTransactionId: originalLinks.get(summary.id) ?? summary.replacementTransactionId });
}
