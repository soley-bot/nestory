"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { financialWriteError } from "@/lib/finance/financial-write-context";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import type { LeaseActionState } from "./actions";

export async function continueLeaseMonthToMonthAction(formData: FormData): Promise<LeaseActionState> {
  const context = await requirePermission("leases.change_terms");
  const parsed = z.object({
    leaseId: postgresUuid("Choose a valid lease and billing rule."), supersedesTermId: postgresUuid("Choose a valid lease and billing rule."), billingRuleId: postgresUuid("Choose a valid lease and billing rule."),
    expectedRent: z.coerce.number().positive(), expectedFeeMode: z.enum(["flat", "percentage"]),
    expectedFeeValue: z.coerce.number().nonnegative(), idempotencyKey: z.string().min(8).max(200),
    confirmedContinuation: z.literal("on"),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Confirm the continuous stay and unchanged rent and fees. Reload if the billing rule is missing." };
  const input = parsed.data;
  const client = await createSupabaseServerClient(formData);
  const result = await client.rpc("continue_lease_month_to_month", {
    p_organization_id: context.organizationId, p_lease_id: input.leaseId,
    p_expected_term_id: input.supersedesTermId, p_expected_billing_rule_id: input.billingRuleId,
    p_expected_rent_amount: input.expectedRent, p_expected_fee_mode: input.expectedFeeMode,
    p_expected_fee_value: input.expectedFeeValue, p_idempotency_key: input.idempotencyKey,
  });
  if (result.error) return { status: "error", message: financialWriteError(result.error.message) ?? "Month-to-month continuation could not be saved. Reload and review the term, billing rule, and any closed financial months before retrying." };
  for (const path of ["/leases", `/leases/${input.leaseId}`, "/rent-income", "/finance", "/balances", "/reports"]) revalidatePath(path);
  return { status: "success", leaseId: input.leaseId, termId: result.data, message: "Month-to-month continuation saved with unchanged rent and fees. Original contract history was kept." };
}
