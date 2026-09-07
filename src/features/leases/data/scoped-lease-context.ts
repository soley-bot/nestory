import { z } from "zod";
import type { createSupabaseServerClient } from "@/lib/db/server";
import { scopedBillingTermSchema } from "@/features/finance-operations/data/scoped-finance-context";

const nullableText = z.string().nullable();
const leaseContextSchema = z.object({
  properties: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), rental_structure: nullableText, archived_at: nullableText })),
  units: z.array(z.object({ id: z.string(), property_id: z.string(), unit_number: z.string(), floor: nullableText, status: z.string(), archived_at: nullableText })),
  availability_leases: z.array(z.object({ id: z.string(), unit_id: nullableText, archived_at: nullableText })),
  availability_terms: z.array(z.object({ lease_id: z.string(), start_date: z.string(), end_date: z.string(), status: z.string(), archived_at: nullableText })),
  people: z.array(z.object({ id: z.string(), display_name: z.string() })),
  parties: z.array(z.object({ id: z.string(), lease_id: z.string(), person_id: z.string(), party_role: z.string(), is_primary: z.boolean(), started_on: nullableText, ended_on: nullableText, archived_at: nullableText })),
  terms: z.array(z.object({
    id: z.string(), lease_id: z.string(), term_sequence: z.number(), start_date: z.string(), end_date: z.string(),
    rent_amount: z.number(), rent_currency: z.enum(["USD"]), rent_due_day: z.number().nullable(), payment_frequency: z.string(), status: z.string(), archived_at: nullableText,
  })),
  billing_terms: z.array(scopedBillingTermSchema),
  occupancies: z.array(z.object({
    id: z.string(), lease_id: z.string(), unit_id: nullableText, status: z.string(), business_lifecycle: z.string(), evidence_state: z.string(),
    scheduled_move_in_date: nullableText, scheduled_move_in_kind: z.string(), scheduled_move_in_confidence: z.string(),
    actual_move_in_date: nullableText, actual_move_in_kind: z.string(), actual_move_in_confidence: z.string(),
    scheduled_move_out_date: nullableText, scheduled_move_out_kind: z.string(), scheduled_move_out_confidence: z.string(),
    actual_move_out_date: nullableText, actual_move_out_kind: z.string(), actual_move_out_confidence: z.string(), archived_at: nullableText,
    participants: z.array(z.object({ id: z.string(), business_lifecycle: z.string(), evidence_state: z.string() })),
  })),
  deposits: z.array(z.object({ id: z.string(), lease_id: z.string(), deposit_type: z.string(), amount: z.number(), currency: z.enum(["USD"]), status: z.string(), archived_at: nullableText })),
  deposit_events: z.array(z.object({
    id: z.string(), lease_deposit_id: z.string(), event_type: z.string(), event_date: z.string(),
    amount: z.number(), currency: z.enum(["USD"]), reference: z.null(), reversal_of_id: nullableText,
  })),
});

export type ScopedLeaseContext = z.infer<typeof leaseContextSchema>;

const leaseRowsSchema = z.array(z.object({
  id: z.string(), property_id: z.string(), unit_id: nullableText,
  tenant_name: z.string(), primary_tenant_person_id: z.string(),
  lease_start_date: z.string(), lease_end_date: z.string(),
  monthly_rent_amount: z.number(), monthly_rent_currency: z.enum(["USD"]),
  deposit_amount: z.number().nullable(), deposit_currency: z.enum(["USD"]).nullable(),
  status: z.string(), archived_at: nullableText,
}));

export function parseScopedLeaseRows(data: unknown) {
  const parsed = leaseRowsSchema.safeParse(data);
  if (!parsed.success) throw new Error("Could not load leases: malformed response");
  return parsed.data;
}

const readinessSchema = z.array(z.object({
  policy_id: nullableText, term_id: nullableText,
  reason_code: z.string(), readiness_status: z.string(),
  repair_context: z.record(z.string(), z.unknown()).nullable(),
})).length(1);

export function parseScopedLeaseReadiness(data: unknown) {
  const parsed = readinessSchema.safeParse(data);
  if (!parsed.success) throw new Error("Could not resolve lease rent readiness: malformed response");
  return parsed.data[0];
}

export async function loadScopedLeaseContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  leaseIds?: string[],
): Promise<ScopedLeaseContext> {
  const result = await supabase.rpc("get_lease_read_context", {
    p_organization_id: organizationId,
    ...(leaseIds === undefined ? {} : { p_lease_ids: leaseIds }),
  });
  if (result.error) throw new Error(`Could not load lease read context: ${result.error.message}`);
  const parsed = leaseContextSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("Could not load lease read context: malformed response");
  return parsed.data;
}
