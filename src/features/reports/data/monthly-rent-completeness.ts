import { z } from "zod";
import type { createSupabaseServerClient } from "@/lib/db/server";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { expiredRentTermEndDate } from "@/features/finance-operations/expired-rent-term";
import { compareReportKeys, readReportSource, readReportSourceBatches } from "./report-source-completeness";
import type { ReportsViewQuery, TrustedReportRow } from "../reports.types";

const invoiceSchema = z.object({ id: z.string(), lease_id: z.string(), property_id: z.string(), billing_period_start: z.string() });
const rentLineSchema = z.object({ id: z.string(), invoice_id: z.string() });

/** Missing billing is a readiness issue, never zero recognized rent or proof of vacancy. */
export async function loadMonthlyRentGaps({ supabase, organizationId, context, viewQuery, period }: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  organizationId: string;
  context: ScopedFinanceContext;
  viewQuery: ReportsViewQuery;
  period: { start: string; end: string };
}): Promise<TrustedReportRow[]> {
  const properties = new Map(context.properties.filter(property => !property.archived_at
    && (viewQuery.propertyId === "all" || property.id === viewQuery.propertyId)
    && (viewQuery.ownerPersonId === "all" || context.owner_assignments.some(owner =>
      owner.property_id === property.id && owner.person_id === viewQuery.ownerPersonId && !owner.archived_at
      && (!owner.started_on || owner.started_on <= period.end) && (!owner.ended_on || owner.ended_on >= period.start)
    ))).map(property => [property.id, property]));
  const leases = context.leases.filter(lease => !lease.archived_at && (["active", "notice_given"].includes(lease.status)
    || (["ended", "terminated"].includes(lease.status) && context.terms.some(term => term.lease_id === lease.id && term.start_date <= period.end && term.end_date >= period.start)))
    && lease.lease_start_date <= period.end && properties.has(lease.property_id)
    && (viewQuery.unitId === "all" || lease.unit_id === viewQuery.unitId));
  const expectedLeases = leases.filter(lease => {
    const started = context.terms.filter(term => term.lease_id === lease.id && term.start_date <= period.end)
      .sort((a,b) => b.start_date.localeCompare(a.start_date));
    // A later zero-rent term cannot erase a positive-rent segment of this month.
    const hasRentInMonth = started.some(term => term.end_date >= period.start && term.rent_amount > 0);
    if (["ended", "terminated"].includes(lease.status)) return hasRentInMonth;
    // Continuing occupancy still needs setup review when its last term expired,
    // or when no authoritative term has started yet.
    return hasRentInMonth || !started.length || started[0].rent_amount > 0;
  });
  if (!expectedLeases.length) return [];
  const invoiceSource = "Could not verify complete monthly rent invoices";
  const invoices = z.array(invoiceSchema).parse(await readReportSourceBatches(
    invoiceSource, properties.keys(), ids => readReportSource(invoiceSource, (from, to) =>
      supabase.from("tenant_invoice_balances")
        .select("id, lease_id, property_id, billing_period_start", { count: "exact" })
        .eq("organization_id", organizationId).in("property_id", ids)
        .eq("lifecycle", "issued").eq("billing_period_start", period.start)
        .order("id").range(from, to),
      row => invoiceSchema.parse(row).id,
      (previous, current) => compareReportKeys(previous.id!, current.id!)),
    row => invoiceSchema.parse(row).id,
  ));
  const lineSource = "Could not verify complete monthly rent invoice lines";
  const lines = await readReportSourceBatches(lineSource, invoices.map(invoice => invoice.id),
    ids => readReportSource(lineSource, (from, to) =>
      supabase.from("tenant_invoice_lines").select("id, invoice_id", { count: "exact" })
        .eq("organization_id", organizationId).in("invoice_id", ids).eq("line_type", "rent")
        .order("id").range(from, to), row => {
      const line = rentLineSchema.parse(row);
      if (!ids.includes(line.invoice_id)) throw new Error("Monthly rent line is outside the requested invoice scope.");
      return line.id;
    }, (previous, current) => compareReportKeys(previous.id, current.id)), row => row.id);
  const rentInvoiceIds = new Set(lines.map(line => line.invoice_id));
  const issued = new Map<string, number>();
  for (const invoice of invoices.filter(invoice => invoice.billing_period_start === period.start && rentInvoiceIds.has(invoice.id))) {
    const key = `${invoice.property_id}:${invoice.lease_id}`;
    issued.set(key, (issued.get(key) ?? 0) + 1);
  }
  return expectedLeases.filter(lease => issued.get(`${lease.property_id}:${lease.id}`) !== 1).map(lease => {
    const duplicate = (issued.get(`${lease.property_id}:${lease.id}`) ?? 0) > 1;
    const expired = expiredRentTermEndDate("billing_setup_missing", period.start, context.terms.filter(term => term.lease_id === lease.id));
    const issue = duplicate ? "Multiple issued rent invoices cover this billing month; review and correct the duplicate billing before using totals." : expired
      ? `Rent term ended ${expired}; confirm continued occupancy and record the agreed renewal before generating rent.`
      : "Monthly rent invoice is missing; review the lease billing setup and generate the missing month.";
    const property = properties.get(lease.property_id)!;
    const href = `/leases/${encodeURIComponent(lease.id)}?section=rent`;
    return { id: `${duplicate ? "duplicate" : "missing"}-rent:${lease.id}`, title: lease.tenant_name, propertyId: lease.property_id,
      href, nextActionHref: href, tone: "danger" as const, sourceCount: 1,
      sourceLinks: [{ id: lease.id, label: "Review lease rent and billing", href, recordType: "lease" as const }],
      sourceSummary: duplicate ? "Multiple issued rent invoices cover the selected billing month." : "Lease has no issued rent invoice for the selected billing month.",
      cells: { property: `${property.code} - ${property.name}`, tenant: lease.tenant_name, issue } };
  });
}
