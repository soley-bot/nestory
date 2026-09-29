import { createSupabaseServerClient } from "@/lib/db/server";

/** Resolve report evidence to its expense through authenticated, organization-scoped reads. */
export async function resolveExpenseReportSource(organizationId: string, sourceType: unknown, sourceId: unknown) {
  if (typeof sourceId !== "string" || !/^[0-9a-f-]{36}$/i.test(sourceId)) return null;
  const db = await createSupabaseServerClient();
  let submissionId: string | undefined;
  if (sourceType === "expense_customer_adjustment") {
    const result = await db.from("expense_customer_adjustments").select("submission_id").eq("organization_id", organizationId).eq("id", sourceId).maybeSingle();
    if (result.error) throw new Error("Could not load the report transaction.");
    submissionId = result.data?.submission_id;
  } else if (sourceType === "owner_invoice_line") {
    const result = await db.from("ips_expense_responsibilities").select("finance_expense_item_id").eq("organization_id", organizationId).eq("owner_invoice_line_id", sourceId).maybeSingle();
    if (result.error) throw new Error("Could not load the report transaction.");
    if (!result.data) return null;
    const expense = await db.from("expense_submissions").select("id").eq("organization_id", organizationId).eq("approved_finance_expense_item_id", result.data.finance_expense_item_id).maybeSingle();
    if (expense.error) throw new Error("Could not load the report expense.");
    submissionId = expense.data?.id;
  } else if (sourceType === "payment_allocation") {
    const allocation = await db.from("finance_payment_allocations").select("expense_item_id").eq("organization_id", organizationId).eq("id", sourceId).maybeSingle();
    if (allocation.error) throw new Error("Could not load the report payment.");
    if (!allocation.data) return null;
    const expense = await db.from("expense_submissions").select("id").eq("organization_id", organizationId).eq("approved_finance_expense_item_id", allocation.data.expense_item_id).maybeSingle();
    if (expense.error) throw new Error("Could not load the report expense.");
    submissionId = expense.data?.id;
  } else if (sourceType === "expense_submission") submissionId = sourceId;
  if (!submissionId) return null;
  const result = await db.from("expense_submissions").select("id,expense_date").eq("organization_id", organizationId).eq("id", submissionId).maybeSingle();
  if (result.error) throw new Error("Could not load the report expense.");
  return result.data;
}
