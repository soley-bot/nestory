import { createSupabaseServerClient } from "@/lib/db/server";
import {
  buildPropertySummary,
  type PropertySummary,
} from "@/features/properties/data/property-summary";

export type { PropertySummary } from "@/features/properties/data/property-summary";

export async function getPropertySummaries(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [propertiesResult, unitsResult, ledgerResult] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, code, property_type, owner, address, status, archived_at",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("code", { ascending: true }),
    supabase
      .from("units")
      .select("property_id, status")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("ledger_entries")
      .select("property_id, direction, amount, currency")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
  ]);

  if (propertiesResult.error) {
    throw new Error(`Could not load properties: ${propertiesResult.error.message}`);
  }

  if (unitsResult.error) {
    throw new Error(`Could not load property units: ${unitsResult.error.message}`);
  }

  if (ledgerResult.error) {
    throw new Error(`Could not load ledger totals: ${ledgerResult.error.message}`);
  }

  const unitsByProperty = groupByProperty(unitsResult.data ?? []);
  const ledgerByProperty = groupByProperty(ledgerResult.data ?? []);

  return (propertiesResult.data ?? []).map((property): PropertySummary => {
    const units = unitsByProperty.get(property.id) ?? [];
    const ledgerEntries = ledgerByProperty.get(property.id) ?? [];

    return buildPropertySummary({ ledgerEntries, property, units });
  });
}

export async function getPropertySummary(
  organizationId: string,
  propertyId: string,
) {
  const properties = await getPropertySummaries(organizationId);
  return properties.find((property) => property.id === propertyId) ?? null;
}

function groupByProperty<T extends { property_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const group = grouped.get(row.property_id) ?? [];
    group.push(row);
    grouped.set(row.property_id, group);
  }

  return grouped;
}
