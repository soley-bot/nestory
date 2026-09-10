import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  loadScopedFinanceContext,
  type ScopedFinanceContext,
} from "@/features/finance-operations/data/scoped-finance-context";
import {
  formatExactCents,
  parseExactMoneyToCents,
} from "@/features/finance/data/property-cash-events.money";
import { getEffectiveRentPolicyCalendarDate } from "@/features/leases/data/leases";
import { getReportDateRange } from "@/features/reports/reports.filters";
import { maxReportSourceRows } from "@/features/reports/data/report-source-completeness";
import type {
  ReportsViewQuery,
  TrustedReport,
  TrustedReportRow,
} from "@/features/reports/reports.types";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Page = PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}>;
const money = z
  .union([z.string(), z.number()])
  .transform(parseExactMoneyToCents);
const invoiceSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  unit_id: z.string().nullable(),
  lease_id: z.string().nullable(),
  invoice_number: z.string(),
  recipient_label: z.string().nullable(),
  issue_date: z.string(),
  due_date: z.string(),
  currency: z.literal("USD"),
});
const lineSchema = z.object({
  id: z.string(),
  invoice_id: z.string(),
  income_item_id: z.string().nullable(),
  amount: money,
});
const receiptSchema = z.object({
  id: z.string(),
  income_item_id: z.string(),
  signed_amount: money,
});
const ownerReceiptSchema = z.object({
  id: z.string(),
  invoice_line_id: z.string(),
  signed_amount: money,
});
const policySchema = z.object({
  effective_from: z.string(),
  rent_calculation_timezone: z.string(),
  version_number: z.number(),
});
const pageSize = 500;
const batchSize = 100;

/** Require an exact count on every page; truncation and changing counts fail closed. */
async function readAll<T>(
  source: string,
  schema: z.ZodType<T>,
  fetchPage: (from: number, to: number) => Page,
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | undefined;
  const identities = new Set<string>();
  do {
    const result = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (result.error)
      throw new Error(`Could not load ${source}: ${result.error.message}`);
    if (
      result.count === null ||
      !Number.isSafeInteger(result.count) ||
      result.count < 0 ||
      result.data === null
    ) {
      throw new Error(`Could not verify complete ${source}.`);
    }
    if (result.count > maxReportSourceRows)
      throw new Error(
        `${source} exceeds the ${maxReportSourceRows} row report limit. Narrow the scope.`,
      );
    if (expected !== undefined && result.count !== expected)
      throw new Error(`${source} changed while loading. Run the report again.`);
    expected = result.count;
    if (result.data.length === 0 && rows.length < expected)
      throw new Error(`Incomplete ${source}.`);
    for (const raw of result.data) {
      const row = schema.parse(raw);
      if (typeof row === "object" && row !== null && "id" in row) {
        const id = String(row.id);
        if (identities.has(id))
          throw new Error(`Duplicate source row in ${source}.`);
        identities.add(id);
      }
      rows.push(row);
    }
    if (rows.length > expected)
      throw new Error(`Inconsistent count for ${source}.`);
  } while (rows.length < expected);
  return rows;
}

async function readBatches<T>(
  ids: string[],
  source: string,
  schema: z.ZodType<T>,
  fetchPage: (ids: string[], from: number, to: number) => Page,
) {
  const rows: T[] = [];
  const uniqueIds = [...new Set(ids)];
  for (let start = 0; start < uniqueIds.length; start += batchSize) {
    rows.push(
      ...(await readAll(source, schema, (from, to) =>
        fetchPage(uniqueIds.slice(start, start + batchSize), from, to),
      )),
    );
    if (rows.length > maxReportSourceRows)
      throw new Error(
        `${source} exceeds the ${maxReportSourceRows} row report limit. Narrow the scope.`,
      );
  }
  return rows;
}

export async function getRentReport({
  organizationId,
  viewQuery,
  supabase: suppliedSupabase,
  financeContext: suppliedContext,
}: {
  organizationId: string;
  viewQuery: ReportsViewQuery;
  supabase?: Client;
  financeContext?: ScopedFinanceContext;
}): Promise<TrustedReport> {
  if (
    viewQuery.report !== "rent-roll" &&
    viewQuery.report !== "rent-collections"
  )
    throw new Error("Unsupported rent report.");
  const supabase = suppliedSupabase ?? (await createSupabaseServerClient());
  const context =
    suppliedContext ??
    (await loadScopedFinanceContext(
      supabase,
      organizationId,
      viewQuery.propertyId === "all" ? undefined : viewQuery.propertyId,
    ));
  for (const rows of [
    context.properties,
    context.units,
    context.leases,
    context.terms,
  ]) {
    if (rows.length > maxReportSourceRows)
      throw new Error("Rent report scope is too large. Select a property.");
  }
  const properties = context.properties.filter(
    (property) =>
      (viewQuery.report !== "rent-roll" || property.archived_at === null) &&
      (viewQuery.propertyId === "all" || property.id === viewQuery.propertyId),
  );
  if (viewQuery.propertyId !== "all" && properties.length === 0)
    throw new Error(
      "The selected property is unavailable in this report scope.",
    );
  const propertyById = new Map(
    properties.map((property) => [property.id, property]),
  );
  const allowedUnits = context.units.filter(
    (unit) =>
      (viewQuery.report !== "rent-roll" || unit.archived_at === null) &&
      propertyById.has(unit.property_id),
  );
  if (
    viewQuery.unitId !== "all" &&
    !allowedUnits.some((unit) => unit.id === viewQuery.unitId)
  )
    throw new Error("The selected unit is unavailable in this report scope.");
  if (viewQuery.ownerPersonId !== "all")
    throw new Error("Owner filtering is not supported for rent reports.");
  const now = new Date();
  const policies = await readAll(
    "rent calendar policies",
    policySchema,
    (from, to) =>
      supabase
        .from("rent_policy_versions")
        .select("effective_from, rent_calculation_timezone, version_number", {
          count: "exact",
        })
        .eq("organization_id", organizationId)
        .eq("lifecycle", "approved")
        .order("effective_from")
        .order("version_number")
        .range(from, to),
  );
  const today = getEffectiveRentPolicyCalendarDate(policies, now);
  if (!["all", "occupied", "vacant"].includes(viewQuery.status))
    throw new Error(
      "Rent reports support current-lease occupancy filters only.",
    );
  const activeLeasesForUnit = (unitId: string, propertyId: string) =>
    context.leases.filter((lease) => {
      if (
        lease.unit_id !== unitId ||
        lease.property_id !== propertyId ||
        lease.archived_at !== null ||
        !["active", "notice_given"].includes(lease.status)
      )
        return false;
      // current_leases chooses dates using database CURRENT_DATE. Select the
      // authoritative term again using the organization's operational date.
      const terms = context.terms.filter((term) => term.lease_id === lease.id);
      if (!terms.length)
        throw new Error("Current lease rent terms are missing or ambiguous.");
      return terms.some(
        (term) => term.start_date <= today && term.end_date >= today,
      );
    });
  const filteredUnits = allowedUnits.filter(
    (unit) =>
      (viewQuery.unitId === "all" || unit.id === viewQuery.unitId) &&
      (viewQuery.status === "all" ||
        (activeLeasesForUnit(unit.id, unit.property_id).length > 0
          ? "occupied"
          : "vacant") === viewQuery.status),
  );
  const unitsById = new Map(filteredUnits.map((unit) => [unit.id, unit]));
  const search = (viewQuery.query ?? "").trim().toLocaleLowerCase();
  const matchesSearch = (row: TrustedReportRow) =>
    !search ||
    Object.values(row.cells).join(" ").toLocaleLowerCase().includes(search);
  const propertyLabel = (id: string) => {
    const property = propertyById.get(id);
    if (!property)
      throw new Error("Rent source is outside the authorized property scope.");
    return `${property.code} · ${property.name}`;
  };
  const base: Pick<
    TrustedReport,
    "generatedAt" | "kind" | "scopeLabel" | "exportFilenameBase"
  > = {
    generatedAt: now.toISOString(),
    kind: viewQuery.report,
    exportFilenameBase: viewQuery.report,
    scopeLabel:
      viewQuery.propertyId === "all"
        ? "All accessible properties"
        : propertyLabel(viewQuery.propertyId),
  };

  if (viewQuery.report === "rent-roll") {
    const rows = filteredUnits
      .map((unit): TrustedReportRow => {
        const leases = activeLeasesForUnit(unit.id, unit.property_id);
        if (leases.length > 1)
          throw new Error(
            "Multiple current leases occupy one unit. Resolve the lease scope before reporting.",
          );
        const lease = leases[0];
        const terms = lease
          ? context.terms.filter(
              (term) =>
                term.lease_id === lease.id &&
                term.start_date <= today &&
                term.end_date >= today,
            )
          : [];
        if (lease && terms.length !== 1)
          throw new Error("Current lease rent terms are missing or ambiguous.");
        const rent = terms.length
          ? parseExactMoneyToCents(terms[0].rent_amount)
          : BigInt(0);
        const sourceLinks: TrustedReportRow["sourceLinks"] = [
          {
            recordType: "unit",
            id: unit.id,
            label: `Unit ${unit.unit_number}`,
            href: `/units/${unit.id}`,
          },
        ];
        if (lease)
          sourceLinks.push({
            recordType: "lease",
            id: lease.id,
            label: lease.tenant_name,
            href: `/leases/${lease.id}?section=rent`,
          });
        return {
          id: unit.id,
          propertyId: unit.property_id,
          title: `${propertyLabel(unit.property_id)} / ${unit.unit_number}`,
          href: `/units/${unit.id}`,
          cells: {
            property: propertyLabel(unit.property_id),
            unit: unit.unit_number,
            status: lease ? "Occupied" : "No current lease",
            tenant: lease?.tenant_name ?? "No current lease",
            leaseStart: terms[0]?.start_date ?? "—",
            leaseEnd: terms[0]?.end_date ?? "—",
            rent: lease ? usd(rent) : "—",
          },
          amounts: { rent: formatExactCents(rent) },
          sourceLinks,
          sourceCount: sourceLinks.length,
          sourceSummary: lease
            ? "Current unit and effective lease term"
            : "Current unit; no effective lease",
          tone: lease ? "neutral" : "warning",
        };
      })
      .filter(matchesSearch)
      .filter(
        (row) =>
          !viewQuery.transactionStatus ||
          viewQuery.transactionStatus === "all" ||
          viewQuery.transactionStatus ===
            (row.sourceCount > 1 ? "occupied" : "no-current-lease"),
      );
    return {
      ...base,
      title: "Rent roll",
      description:
        "Current snapshot of units and effective lease rent. Units without a current lease carry no contracted rent; date-range filters do not reconstruct historical occupancy.",
      periodLabel: `Current snapshot · ${today}`,
      emptyTitle: "No units match",
      emptyDescription: "Adjust the property, unit, status or search filters.",
      columns: [
        { key: "property", label: "Property" },
        { key: "unit", label: "Unit" },
        { key: "status", label: "Current lease" },
        { key: "tenant", label: "Tenant" },
        { key: "leaseStart", label: "Term start" },
        { key: "leaseEnd", label: "Term end" },
        { key: "rent", label: "Monthly rent", align: "right", numeric: true },
      ],
      rows,
      filterOptions: {
        statuses: [
          { id: "occupied", label: "Occupied" },
          { id: "no-current-lease", label: "No current lease" },
        ],
      },
      summary: [
        metric("Units", String(rows.length), rows.length),
        metric(
          "With current lease",
          String(rows.filter((row) => row.sourceCount > 1).length),
          rows.length,
        ),
        metric(
          "Contracted monthly rent",
          usd(total(rows, "rent")),
          rows.length,
        ),
      ],
      totalsTraceLabel:
        "Totals include only visible units and their currently effective lease terms.",
    };
  }

  const period = getReportDateRange(viewQuery);
  const invoices = await readBatches(
    properties.map((property) => property.id),
    "rent invoices",
    invoiceSchema,
    (ids, from, to) => {
      let query = supabase
        .from("tenant_invoice_balances")
        .select(
          "id, property_id, unit_id, lease_id, invoice_number, recipient_label, issue_date, due_date, currency",
          { count: "exact" },
        )
        .eq("organization_id", organizationId)
        .in("property_id", ids)
        .eq("lifecycle", "issued")
        .gte("issue_date", period.start)
        .lte("issue_date", period.end)
        .order("id");
      if (viewQuery.unitId !== "all")
        query = query.eq("unit_id", viewQuery.unitId);
      return query.range(from, to);
    },
  );
  const selectedInvoices = invoices.filter((invoice) => {
    propertyLabel(invoice.property_id);
    if (
      invoice.unit_id !== null &&
      !allowedUnits.some(
        (unit) =>
          unit.id === invoice.unit_id &&
          unit.property_id === invoice.property_id,
      )
    )
      throw new Error("Invoice unit scope is unavailable.");
    return invoice.unit_id === null
      ? viewQuery.unitId === "all" && viewQuery.status === "all"
      : unitsById.has(invoice.unit_id);
  });
  const lines = await readBatches(
    selectedInvoices.map((invoice) => invoice.id),
    "rent invoice lines",
    lineSchema,
    (ids, from, to) =>
      supabase
        .from("tenant_invoice_lines")
        .select("id, invoice_id, income_item_id, amount", { count: "exact" })
        .eq("organization_id", organizationId)
        .in("invoice_id", ids)
        .eq("line_type", "rent")
        .order("id")
        .range(from, to),
  );
  const [receipts, ownerReceipts] = await Promise.all([
    readBatches(
      lines.flatMap((line) =>
        line.income_item_id ? [line.income_item_id] : [],
      ),
      "rent receipt allocations",
      receiptSchema,
      (ids, from, to) =>
        supabase
          .from("finance_receipt_allocations")
          .select("id, income_item_id, signed_amount", { count: "exact" })
          .eq("organization_id", organizationId)
          .in("income_item_id", ids)
          .order("id")
          .range(from, to),
    ),
    readBatches(
      lines.map((line) => line.id),
      "owner rent collection allocations",
      ownerReceiptSchema,
      (ids, from, to) =>
        supabase
          .from("owner_collection_confirmation_allocations")
          .select("id, invoice_line_id, signed_amount", { count: "exact" })
          .eq("organization_id", organizationId)
          .in("invoice_line_id", ids)
          .order("id")
          .range(from, to),
    ),
  ]);
  const rows = selectedInvoices
    .flatMap((invoice): TrustedReportRow[] => {
      const invoiceLines = lines.filter(
        (line) => line.invoice_id === invoice.id,
      );
      if (!invoiceLines.length) return [];
      const incomeIds = new Set(
        invoiceLines.map((line) => line.income_item_id),
      );
      const lineIds = new Set(invoiceLines.map((line) => line.id));
      const paid = receipts.filter((receipt) =>
        incomeIds.has(receipt.income_item_id),
      );
      const ownerPaid = ownerReceipts.filter((receipt) =>
        lineIds.has(receipt.invoice_line_id),
      );
      const charges = invoiceLines.reduce(
        (sum, line) => sum + line.amount,
        BigInt(0),
      );
      const received = [...paid, ...ownerPaid].reduce(
        (sum, receipt) => sum + receipt.signed_amount,
        BigInt(0),
      );
      if (received < BigInt(0))
        throw new Error("Rent receipts have an invalid negative net balance.");
      const balance = charges - received;
      const outstanding = balance > BigInt(0) ? balance : BigInt(0);
      const credit = balance < BigInt(0) ? -balance : BigInt(0);
      const status =
        credit > BigInt(0)
          ? "credit"
          : outstanding === BigInt(0)
            ? "paid"
            : invoice.due_date < today
              ? "overdue"
              : received > BigInt(0)
                ? "partial"
                : "unpaid";
      if (
        viewQuery.transactionStatus &&
        viewQuery.transactionStatus !== "all" &&
        viewQuery.transactionStatus !== status
      )
        return [];
      const href = invoice.lease_id
        ? `/leases/${invoice.lease_id}?section=rent`
        : `/finance?query=${encodeURIComponent(invoice.invoice_number)}`;
      const sourceLinks: TrustedReportRow["sourceLinks"] = [
        ...invoiceLines.map((line) => ({
          id: line.id,
          label: `${invoice.invoice_number} · Rent line`,
          recordType: "income-obligation" as const,
          href,
        })),
        ...paid.map((receipt) => ({
          id: receipt.id,
          label: "Rent receipt allocation",
          recordType: "receipt-allocation" as const,
          href,
        })),
        ...ownerPaid.map((receipt) => ({
          id: receipt.id,
          label: "Owner collection allocation",
          recordType: "owner-collection-allocation" as const,
          href,
        })),
      ];
      return [
        {
          id: invoice.id,
          propertyId: invoice.property_id,
          title: invoice.invoice_number,
          href,
          sourceLinks,
          sourceCount: sourceLinks.length,
          sourceSummary:
            "Signed rent charges and current receipt allocations; non-rent invoice lines excluded",
          tone: status === "overdue" ? "danger" : "neutral",
          cells: {
            property: propertyLabel(invoice.property_id),
            unit: invoice.unit_id
              ? unitsById.get(invoice.unit_id)!.unit_number
              : "Property-wide",
            tenant: invoice.recipient_label ?? "Recipient not recorded",
            invoice: invoice.invoice_number,
            issued: invoice.issue_date,
            dueDate: invoice.due_date,
            charges: usd(charges),
            received: usd(received),
            outstanding: usd(outstanding),
            credit: usd(credit),
            status: label(status),
          },
          amounts: {
            charges: formatExactCents(charges),
            received: formatExactCents(received),
            outstanding: formatExactCents(outstanding),
            credit: formatExactCents(credit),
          },
        },
      ];
    })
    .filter(matchesSearch);
  return {
    ...base,
    title: "Rent collections",
    description:
      "Rent lines on invoices issued in the selected range. Received, outstanding and credit are their current settlement positions, including signed corrections; this is not cash received within the date range.",
    periodLabel: `Issued ${period.start} – ${period.end} · Balances current at ${today}`,
    emptyTitle: "No rent invoices match",
    emptyDescription:
      "Adjust the issue-date range, property, unit, status or search filters.",
    rows,
    columns: [
      { key: "property", label: "Property" },
      { key: "unit", label: "Unit" },
      { key: "tenant", label: "Tenant" },
      { key: "invoice", label: "Invoice" },
      { key: "issued", label: "Issued" },
      { key: "dueDate", label: "Due date" },
      ...["charges", "received", "outstanding", "credit"].map((key) => ({
        key,
        label: label(key),
        align: "right" as const,
        numeric: true,
      })),
      { key: "status", label: "Status" },
    ],
    summary: ["charges", "received", "outstanding", "credit"].map((key) =>
      metric(label(key), usd(total(rows, key)), rows.length),
    ),
    filterOptions: {
      statuses: ["paid", "partial", "unpaid", "overdue", "credit"].map(
        (id) => ({ id, label: label(id) }),
      ),
    },
    totalsTraceLabel:
      "Totals sum visible signed rent lines and their current IPS/owner allocations. Credits are shown separately from outstanding rent.",
  };
}

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}
function usd(cents: bigint) {
  return `${cents < BigInt(0) ? "-" : ""}USD ${formatExactCents(cents < BigInt(0) ? -cents : cents).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
function total(rows: TrustedReportRow[], key: string) {
  return rows.reduce(
    (sum, row) => sum + parseExactMoneyToCents(row.amounts?.[key] ?? "0"),
    BigInt(0),
  );
}
function metric(name: string, value: string, sourceCount: number) {
  return {
    label: name,
    value,
    sourceCount,
    detail: "Visible report rows only",
  };
}
