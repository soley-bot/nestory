import type { createSupabaseServerClient } from "@/lib/db/server";
import { getBusinessDateValue } from "@/lib/dates/business-date";

export async function getMaintenanceCaseCounts({
  supabase,
  organizationId,
  scopeColumn,
  scopeId,
  businessDate = getBusinessDateValue(),
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  organizationId: string;
  scopeColumn: "property_id" | "unit_id";
  scopeId: string;
  businessDate?: string;
}) {
  const openQuery = () => supabase.from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq(scopeColumn, scopeId)
    .is("archived_at", null)
    .not("status", "in", "(completed,cancelled)");
  const results = await Promise.all([
    openQuery(),
    openQuery().lt("due_date", businessDate),
  ]);
  const counts = results.map(result => {
    if (result.error || !Number.isSafeInteger(result.count) || result.count === null || result.count < 0) {
      throw new Error(`Could not load maintenance counts: ${result.error?.message ?? "Exact count unavailable"}`);
    }
    return result.count;
  });
  return { openMaintenanceCases: counts[0], overdueMaintenanceCases: counts[1] };
}
