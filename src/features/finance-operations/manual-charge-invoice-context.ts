"use server";

import { withFinancialIntentReadContext } from "@/lib/finance/financial-write-context.server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const inputSchema = z.object({
  leaseId: idSchema,
  billingPeriod: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/),
});
const invoiceSchema = z.object({
  id: idSchema, organization_id: z.string(), lease_id: idSchema, billing_period_start: z.iso.date(),
  invoice_number: z.string().min(1), due_date: z.iso.date(), payment_status: z.enum(["paid", "partly_paid", "unpaid", "voided"]),
});

export async function loadManualChargeInvoiceContext(input: { leaseId: string; billingPeriod: string }, financialIntent?: FormData) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Choose a valid lease and billing month.");
  const context = await requirePermission("finance.record_payments");
  return withFinancialIntentReadContext(context.organizationId, financialIntent, async () => {
  const supabase = await createSupabaseServerClient(financialIntent);
  const result = await supabase.from("tenant_invoice_balances")
    .select("id,organization_id,lease_id,billing_period_start,invoice_number,due_date,payment_status")
    .eq("organization_id", context.organizationId).eq("lease_id", parsed.data.leaseId)
    .eq("billing_period_start", `${parsed.data.billingPeriod}-01`).maybeSingle();
  if (result.error) throw new Error("Could not check this billing month's invoice. Try again.");
  if (result.data === null) return null;
  const invoice = invoiceSchema.safeParse(result.data);
  if (!invoice.success || invoice.data.organization_id !== context.organizationId ||
      invoice.data.lease_id !== parsed.data.leaseId || invoice.data.billing_period_start !== `${parsed.data.billingPeriod}-01`) {
    throw new Error("Could not verify this billing month's invoice. Try again.");
  }
  if (invoice.data.payment_status === "voided") throw new Error("This month's invoice is voided. Review the lease before adding a charge.");
  return { id: invoice.data.id, invoiceNumber: invoice.data.invoice_number, dueDate: invoice.data.due_date };
  }, `${parsed.data.billingPeriod}-01`);
}
