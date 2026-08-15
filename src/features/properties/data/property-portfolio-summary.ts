import { ACTIVE_UNIT_LEASE_STATUSES } from "@/features/units/data/unit-summary";
import { createSupabaseServerClient } from "@/lib/db/server";

export type PropertyPortfolioSummary = {
  activeProperties: number;
  totalUnits: number;
  unitsWithoutCurrentLease: number;
};

export async function getPropertyPortfolioSummary(
  organizationId: string,
): Promise<PropertyPortfolioSummary> {
  const supabase = await createSupabaseServerClient();
  const [propertiesResult, unitsResult, currentLeasesResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("archived_at", null),
    supabase
      .from("units")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "inactive")
      .is("archived_at", null),
    supabase
      .from("current_leases")
      .select("unit_id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", [...ACTIVE_UNIT_LEASE_STATUSES])
      .not("unit_id", "is", null)
      .is("archived_at", null),
  ]);

  if (propertiesResult.error) {
    throw new Error(
      `Could not load active property count: ${propertiesResult.error.message}`,
    );
  }
  if (unitsResult.error) {
    throw new Error(`Could not load unit count: ${unitsResult.error.message}`);
  }
  if (currentLeasesResult.error) {
    throw new Error(
      `Could not load current lease count: ${currentLeasesResult.error.message}`,
    );
  }

  const totalUnits = unitsResult.count ?? 0;
  const currentLeaseCount = currentLeasesResult.count ?? 0;

  return {
    activeProperties: propertiesResult.count ?? 0,
    totalUnits,
    unitsWithoutCurrentLease: Math.max(0, totalUnits - currentLeaseCount),
  };
}
