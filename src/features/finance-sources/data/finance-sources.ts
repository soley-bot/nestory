import "server-only";

import { createSupabaseServerClient } from "@/lib/db/server";
import type {
  FinanceSourceKind,
  FinanceSourceScopeKind,
  FinanceSourcesData,
} from "@/features/finance-sources/finance-sources.types";

export async function getFinanceSourcesData(
  organizationId: string,
): Promise<FinanceSourcesData> {
  const supabase = await createSupabaseServerClient();
  const [sourcesResult, propertiesResult] = await Promise.all([
    supabase
      .from("financial_reconciliation_sources")
      .select(
        "id, property_id, currency, code, display_name, source_kind, scope_kind, masked_reference, archived_at",
      )
      .eq("organization_id", organizationId)
      .order("code")
      .order("display_name"),
    supabase
      .from("properties")
      .select("id, code, name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("code")
      .order("name"),
  ]);

  if (sourcesResult.error) {
    throw new Error(
      `Could not load funding sources: ${sourcesResult.error.message}`,
    );
  }
  if (propertiesResult.error) {
    throw new Error(
      `Could not load funding-source properties: ${propertiesResult.error.message}`,
    );
  }

  const properties = (propertiesResult.data ?? []).map((property) => ({
    id: property.id,
    label: `${property.code} · ${property.name}`,
  }));
  const propertyLabelById = new Map(
    properties.map((property) => [property.id, property.label]),
  );

  return {
    properties,
    sources: (sourcesResult.data ?? []).map((source) => ({
      archivedAt: source.archived_at,
      code: source.code,
      currency: source.currency,
      displayName: source.display_name,
      id: source.id,
      maskedReference: source.masked_reference,
      propertyId: source.property_id,
      propertyLabel: source.property_id
        ? propertyLabelById.get(source.property_id) ?? "Property unavailable"
        : null,
      scopeKind: source.scope_kind as FinanceSourceScopeKind,
      sourceKind: source.source_kind as FinanceSourceKind,
    })),
  };
}
