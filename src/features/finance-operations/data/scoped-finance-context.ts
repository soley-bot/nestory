import { z } from "zod";
import type { createSupabaseServerClient } from "@/lib/db/server";

const nullableText = z.string().nullable();

export const scopedBillingTermSchema = z.object({
  archived_at: nullableText,
  billing_recipient_kind: nullableText,
  billing_recipient_person_id: nullableText,
  charge_management_fee_when_active: z.boolean(),
  charge_through_lease_end: z.boolean(),
  collection_route: nullableText,
  created_at: z.string(),
  effective_from: z.string(),
  effective_to: z.string(),
  final_period_prorated_amount: z.number().nullable(),
  first_period_prorated_amount: z.number().nullable(),
  full_management_fee_during_proration: z.boolean(),
  id: z.string(),
  lease_end_proration_rule: z.string(),
  lease_id: z.string(),
  lease_start_proration_rule: z.string(),
  management_fee_mode: nullableText,
  management_fee_value: z.number().nullable(),
  mid_period_rent_change_rule: z.string(),
  organization_id: z.string(),
  property_id: z.string(),
  rent_calculation_timezone: z.string(),
  rule_source: z.string(),
  short_month_due_day_rule: z.string(),
});

export type ScopedBillingTerm = z.infer<typeof scopedBillingTermSchema>;

const financeContextSchema = z.object({
  properties: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), archived_at: nullableText })),
  units: z.array(z.object({ id: z.string(), property_id: z.string(), unit_number: z.string(), archived_at: nullableText })),
  people: z.array(z.object({ id: z.string(), display_name: z.string(), party_type: z.string(), archived_at: nullableText })),
  owner_assignments: z.array(z.object({
    id: z.string(), property_id: z.string(), person_id: z.string(), is_primary: z.boolean(),
    started_on: nullableText, ended_on: nullableText, archived_at: nullableText,
  })),
  leases: z.array(z.object({
    id: z.string(), property_id: z.string(), unit_id: nullableText,
    primary_tenant_person_id: z.string(), tenant_name: z.string(), status: z.string(),
    lease_start_date: z.string(), lease_end_date: z.string(), monthly_rent_amount: z.number(), archived_at: nullableText,
  })),
  terms: z.array(z.object({ lease_id: z.string(), start_date: z.string(), end_date: z.string(), rent_amount: z.number() })),
  billing_terms: z.array(scopedBillingTermSchema),
});

export type ScopedFinanceContext = z.infer<typeof financeContextSchema>;

export async function loadScopedFinanceContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  propertyId?: string | null,
): Promise<ScopedFinanceContext> {
  const result = await supabase.rpc("get_finance_read_context", {
    p_organization_id: organizationId,
    ...(propertyId ? { p_requested_property_id: propertyId } : {}),
  });
  if (result.error) throw new Error(`Could not load finance read context: ${result.error.message}`);
  const parsed = financeContextSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("Could not load finance read context: malformed response");
  return parsed.data;
}
