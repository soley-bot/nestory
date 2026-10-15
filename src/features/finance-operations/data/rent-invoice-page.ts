import { z } from "zod";
import type { createSupabaseServerClient } from "@/lib/db/server";
import type { Database } from "@/types/database";
import { RentPropertyUnavailableError, type RentInvoiceQuery } from "../rent-invoice-query";

export const RENT_INVOICE_PAGE_SIZE = 50;

// Validate the financial fields before accepting a page as authoritative. The
// projection deliberately returns only the balance-view columns used by Finance.
const invoiceSchema = z.object({
  id: z.string(), organization_id: z.string(), property_id: z.string(),
  unit_id: z.string().nullable(), lease_id: z.string(), invoice_number: z.string(),
  issue_date: z.string(), due_date: z.string(), billing_period_start: z.string(),
  billing_period_end: z.string(), collection_route: z.enum(["through_ips", "direct_to_owner"]),
  recipient_label: z.string(), occupant_labels: z.array(z.string()), currency: z.literal("USD"),
  total_amount: z.number().finite(), balance_due: z.number().finite(),
  paid_through_ips: z.number().finite(), collected_by_owner: z.number().finite(),
  payment_status: z.enum(["paid", "partly_paid", "unpaid", "voided"]),
});
const pageSchema = z.object({
  invoices: z.array(invoiceSchema).max(RENT_INVOICE_PAGE_SIZE),
  selectedInvoice: invoiceSchema.nullable(),
  pagination: z.object({
    from: z.number().int().nonnegative(), to: z.number().int().nonnegative(),
    page: z.number().int().positive(), pageSize: z.literal(RENT_INVOICE_PAGE_SIZE),
    totalCount: z.number().int().nonnegative(), totalPages: z.number().int().positive(),
  }),
  totalVisibleCount: z.number().int().nonnegative(),
  totalsByCurrency: z.array(z.object({
    currency: z.literal("USD"), collected: z.number().finite(), outstanding: z.number().finite(),
  })).max(1),
  propertyOptions: z.array(z.object({ id: z.string(), label: z.string() })),
});

export type RentInvoicePage = Omit<z.infer<typeof pageSchema>, "invoices" | "selectedInvoice">;
type BalanceRow = Database["public"]["Views"]["tenant_invoice_balances"]["Row"];

export async function loadRentInvoicePage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  propertyId: string | null | undefined,
  query: RentInvoiceQuery,
) {
  const result = await supabase.rpc("get_rent_invoice_page", {
    p_organization_id: organizationId,
    ...(propertyId ? { p_property_id: propertyId } : {}),
    ...(query.unitId ? { p_unit_id: query.unitId } : {}),
    ...(query.leaseId ? { p_lease_id: query.leaseId } : {}),
    ...(query.selectedInvoiceId ? { p_selected_invoice_id: query.selectedInvoiceId } : {}),
    p_query: query.query, p_status: query.status, p_due: query.due,
    p_overdue_days: query.overdueDays === "all" ? 0 : Number(query.overdueDays),
    p_sort: query.sort, p_page: query.page, p_page_size: RENT_INVOICE_PAGE_SIZE,
  });
  if (result.error?.code === "42501" && propertyId) throw new RentPropertyUnavailableError();
  if (result.error) throw new Error(`Could not load rent invoices: ${result.error.message}`);
  const parsed = pageSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("Could not load rent invoices: malformed page response");
  const { invoices, selectedInvoice, ...page } = parsed.data;
  const { totalCount, page: pageNumber, pageSize } = page.pagination;
  const expectedFrom = totalCount === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
  const expectedTo = Math.min(pageNumber * pageSize, totalCount);
  const expectedLength = totalCount === 0 ? 0 : expectedTo - expectedFrom + 1;
  if (page.pagination.totalPages !== Math.max(1, Math.ceil(totalCount / pageSize)) ||
      pageNumber > page.pagination.totalPages || page.pagination.from !== expectedFrom || page.pagination.to !== expectedTo ||
      page.totalVisibleCount < totalCount || (totalCount > 0 && page.totalsByCurrency.length !== 1) ||
      invoices.length !== expectedLength || new Set(invoices.map(row => row.id)).size !== invoices.length ||
      [...invoices, ...(selectedInvoice ? [selectedInvoice] : [])].some(row =>
        row.organization_id !== organizationId || (propertyId && row.property_id !== propertyId) ||
        (query.unitId && row.unit_id !== query.unitId) || (query.leaseId && row.lease_id !== query.leaseId)) ||
      (selectedInvoice && selectedInvoice.id !== query.selectedInvoiceId)) {
    throw new Error("Could not load rent invoices: inconsistent page response");
  }
  return { page, invoices: invoices as BalanceRow[], selectedInvoice: selectedInvoice as BalanceRow | null };
}
