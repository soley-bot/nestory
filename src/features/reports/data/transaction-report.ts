import { createSupabaseServerClient } from "@/lib/db/server";
import { getReportDateRange } from "@/features/reports/reports.filters";
import {
  loadScopedFinanceContext,
  type ScopedFinanceContext,
} from "@/features/finance-operations/data/scoped-finance-context";
import { iterateOwnerProfitLossEvents } from "@/features/reports/data/owner-profit-loss-events";
import type { OwnerProfitLossEventsRpcClient } from "@/features/reports/data/owner-profit-loss-events.types";
import { iteratePropertyCashEvents } from "@/features/finance/data/property-cash-events";
import type { PropertyCashEventsRpcClient } from "@/features/finance/data/property-cash-events.types";
import {
  formatExactCents,
  parseExactMoneyToCents,
} from "@/features/finance/data/property-cash-events.money";
import type {
  ReportsViewQuery,
  TrustedReport,
  ReportSourceRecordType,
} from "@/features/reports/reports.types";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Database = import("@/types/database.generated").Database;
const MAX_ROWS = 10_000;
const PAGE_SIZE = 500;
const typeLabels = {
  "rent-charge": "Rent charge",
  receipt: "Company receipts",
  "paid-cost": "Paid cost",
  "management-fee": "Management fee",
};
type TransactionType = keyof typeof typeLabels;
const amountKeys: Record<TransactionType, string> = {
  "rent-charge": "rentCharges",
  receipt: "receipts",
  "paid-cost": "paidCosts",
  "management-fee": "managementFees",
};
export type TransactionReportEntry = {
  id: string;
  date: string;
  propertyId: string;
  unitId: string | null;
  type: TransactionType;
  status: string;
  description: string;
  amountCents: bigint;
  sourceId?: string;
  category?: string;
  reference?: string | null;
  paidFrom?: string;
  payeeLabel?: string;
  payeeId: string | null;
  href: string;
  recordType: ReportSourceRecordType;
};

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
};
/** A function's SQL limit can itself be truncated by the Data API row cap. */
export function assertTransactionRpcPage(result: PageResult<unknown>) {
  if (result.error)
    throw new Error(`Transaction event source failed: ${result.error.message}`);
  if (
    result.count === null ||
    !result.data ||
    result.count !== result.data.length
  ) {
    throw new Error(
      "Transaction event source is incomplete; narrow the scope.",
    );
  }
}
/** Verify an exact stable count; PostgREST may cap each page below our requested size. */
export async function loadTransactionReportPages<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
) {
  const rows: T[] = [];
  const seen = new Set<string>();
  let expected: number | undefined;
  for (;;) {
    const result = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (result.error || !result.data)
      throw new Error(
        `Could not load complete transaction report source: ${result.error?.message ?? "missing data"}`,
      );
    if (
      result.count === null ||
      !Number.isSafeInteger(result.count) ||
      result.count < 0
    )
      throw new Error("Transaction source exact count is unavailable.");
    if (result.count > MAX_ROWS)
      throw new Error(
        "Transaction report exceeds 10,000 source rows; narrow the scope.",
      );
    if (expected !== undefined && expected !== result.count)
      throw new Error(
        "Transaction source count changed while loading; run the report again.",
      );
    expected = result.count;
    if (result.data.length === 0 && rows.length < expected)
      throw new Error("Transaction source is incomplete.");
    if (result.data.length > PAGE_SIZE)
      throw new Error("Transaction report source exceeded page size.");
    for (const row of result.data) {
      if (!row.id || seen.has(row.id))
        throw new Error(
          "Transaction report source identity repeated or missing.",
        );
      seen.add(row.id);
      rows.push(row);
      if (rows.length > MAX_ROWS)
        throw new Error(
          "Transaction report exceeds 10,000 source rows; narrow the scope.",
        );
    }
    if (rows.length > expected)
      throw new Error("Transaction source count is inconsistent.");
    if (rows.length === expected) return rows;
  }
}

export async function getTransactionReport({
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
  const period = getReportDateRange(viewQuery);
  const supabase = suppliedSupabase ?? (await createSupabaseServerClient());
  const profitClient: OwnerProfitLossEventsRpcClient = {
    async rpc(name, args) {
      // The RPC intentionally accepts null initial cursors; generated Args omit SQL nullability.
      const result = await supabase.rpc(
        name,
        args as unknown as Database["public"]["Functions"]["get_owner_profit_loss_events_page"]["Args"],
        { count: "exact" },
      );
      assertTransactionRpcPage(result);
      return result as unknown as Awaited<
        ReturnType<OwnerProfitLossEventsRpcClient["rpc"]>
      >;
    },
  };
  const cashClient: PropertyCashEventsRpcClient = {
    async rpc(name, args) {
      const result = await supabase.rpc(
        name,
        args as unknown as Database["public"]["Functions"]["get_property_cash_events_page"]["Args"],
        { count: "exact" },
      );
      assertTransactionRpcPage(result);
      return result as unknown as Awaited<
        ReturnType<PropertyCashEventsRpcClient["rpc"]>
      >;
    },
  };
  const context =
    suppliedContext ??
    (await loadScopedFinanceContext(
      supabase,
      organizationId,
      viewQuery.propertyId === "all" ? undefined : viewQuery.propertyId,
    ));
  const properties = context.properties.filter(
    (p) => viewQuery.propertyId === "all" || p.id === viewQuery.propertyId,
  );
  if (properties.length > 100)
    throw new Error(
      "Transaction report exceeds 100 properties; narrow the scope.",
    );
  if (viewQuery.propertyId !== "all" && !properties.length)
    throw new Error(
      "Transaction report property is outside the permitted scope.",
    );
  if (
    viewQuery.unitId !== "all" &&
    !context.units.some(
      (u) =>
        u.id === viewQuery.unitId &&
        properties.some((p) => p.id === u.property_id),
    )
  )
    throw new Error("Transaction report unit is outside the permitted scope.");
  const entries: TransactionReportEntry[] = [];
  const add = (entry: TransactionReportEntry) => {
    entries.push(entry);
    if (entries.length > MAX_ROWS)
      throw new Error(
        "Transaction report exceeds 10,000 rows; narrow the scope.",
      );
  };
  const selectedType =
    viewQuery.report === "management-fees"
      ? "management-fee"
      : (viewQuery.transactionType ?? "all");
  const needs = (type: TransactionType) =>
    selectedType === "all" || selectedType === type;
  async function loadProperty(property: (typeof properties)[number]) {
    const scope = {
      organizationId,
      propertyId: property.id,
      currency: "USD" as const,
      periodStart: period.start,
      periodEnd: period.end,
    };
    if (needs("rent-charge") || needs("management-fee"))
      for await (const event of iterateOwnerProfitLossEvents(
        profitClient,
        scope,
      )) {
        const isFee = event.sourceType === "management_fee_occurrence";
        if (
          (isFee && !needs("management-fee")) ||
          (!isFee && !needs("rent-charge"))
        )
          continue;
        if (
          !isFee &&
          (viewQuery.report === "management-fees" ||
            event.sourceType !== "tenant_invoice_line" ||
            event.categoryReportingGroup !== "rent")
        )
          continue;
        add({
          id: event.eventKey,
          sourceId: event.sourceId,
          category: event.categoryLabel,
          date: event.recognizedOn,
          propertyId: event.propertyId,
          unitId: event.unitId,
          type: isFee ? "management-fee" : "rent-charge",
          status: event.isReversal
            ? "reversal"
            : isFee
              ? "incurred"
              : "recorded",
          description: event.description,
          amountCents: event.signedAmountCents,
          payeeId: null,
          href: event.leaseId
            ? `/leases/${encodeURIComponent(event.leaseId)}`
            : accountHref(property.id, event.recognizedOn),
          recordType: isFee ? "property-account-entry" : "income-obligation",
        });
      }
    if (viewQuery.report === "management-fees") return;
    const costEntries: TransactionReportEntry[] = [];
    if (needs("paid-cost"))
      for await (const event of iteratePropertyCashEvents(cashClient, scope)) {
        if (
          event.economicClass !== "operating_expense" &&
          !(
            ["payment_allocation", "petty_cash_entry"].includes(
              event.sourceType,
            ) && event.categoryCode === "company_cost"
          )
        )
          continue;
        if (
          event.resolutionState !== "resolved" ||
          event.operatingCashEffectCents === null
        )
          throw new Error(
            "Paid cost source is unresolved; transaction totals cannot be certified.",
          );
        const cost: TransactionReportEntry = {
          id: event.eventKey,
          sourceId: event.sourceId,
          category: event.categoryCode,
          reference: event.reference,
          date: event.eventDate,
          propertyId: event.propertyId,
          unitId: event.unitId,
          type: "paid-cost",
          status: event.isReversal ? "reversal" : "recorded",
          description: event.description,
          amountCents: -event.amountCents,
          payeeId: event.vendorPersonId,
          href: accountHref(property.id, event.eventDate),
          recordType:
            event.sourceType === "petty_cash_entry"
              ? "petty-cash-entry"
              : "payment-allocation",
        };
        costEntries.push(cost);
        add(cost);
      }
    if (costEntries.length)
      await enrichPaidCosts(supabase, organizationId, property.id, costEntries);
    if (!needs("receipt")) return;
    // Invoice headers supply scope only. Their totals are never added to line charges or receipts.
    const invoices = await loadTransactionReportPages((from, to) =>
      supabase
        .from("tenant_invoices")
        .select(
          "id, organization_id, property_id, unit_id, lease_id, invoice_number",
          { count: "exact" },
        )
        .eq("organization_id", organizationId)
        .eq("property_id", property.id)
        .order("id")
        .range(from, to),
    );
    if (
      invoices.some(
        (i) =>
          i.organization_id !== organizationId || i.property_id !== property.id,
      )
    )
      throw new Error("Invoice source escaped transaction report scope.");
    for (let offset = 0; offset < invoices.length; offset += PAGE_SIZE) {
      const batch = new Map(
        invoices.slice(offset, offset + PAGE_SIZE).map((i) => [i.id, i]),
      );
      const payments = await loadTransactionReportPages((from, to) =>
        supabase
          .from("tenant_invoice_payments")
          .select(
            "id, organization_id, invoice_id, amount, currency, received_date, receipt_number, reference, reversal_of_id",
            { count: "exact" },
          )
          .eq("organization_id", organizationId)
          .in("invoice_id", [...batch.keys()])
          .gte("received_date", period.start)
          .lte("received_date", period.end)
          .order("id")
          .range(from, to),
      );
      for (const payment of payments) {
        const invoice = batch.get(payment.invoice_id);
        if (
          !invoice ||
          payment.organization_id !== organizationId ||
          payment.currency !== "USD" ||
          payment.received_date < period.start ||
          payment.received_date > period.end
        )
          throw new Error("Receipt source escaped transaction report scope.");
        const amount = parseExactMoneyToCents(payment.amount);
        if (
          (payment.reversal_of_id && amount >= BigInt(0)) ||
          (!payment.reversal_of_id && amount < BigInt(0))
        )
          throw new Error("Receipt reversal has inconsistent signed money.");
        add({
          id: `tenant_invoice_payment:${payment.id}`,
          sourceId: payment.id,
          reference: payment.reference,
          category: "Invoice receipt",
          date: payment.received_date,
          propertyId: invoice.property_id,
          unitId: invoice.unit_id,
          type: "receipt",
          status: payment.reversal_of_id ? "reversal" : "recorded",
          description: `${payment.receipt_number} · ${invoice.invoice_number}${payment.reference ? ` · ${payment.reference}` : ""}`,
          amountCents: amount,
          payeeId: null,
          href: `/leases/${encodeURIComponent(invoice.lease_id)}`,
          recordType: "receipt",
        });
      }
    }
  }
  // Four bounded workers avoid one serial network waterfall per property.
  for (let offset = 0; offset < properties.length; offset += 4) {
    await Promise.all(properties.slice(offset, offset + 4).map(loadProperty));
  }
  return buildTransactionReport({ entries, context, viewQuery, period });
}

export function buildTransactionReport({
  entries,
  context,
  viewQuery,
  period,
}: {
  entries: TransactionReportEntry[];
  context: ScopedFinanceContext;
  viewQuery: ReportsViewQuery;
  period: { start: string; end: string };
}): TrustedReport {
  const properties = new Map(
    context.properties.map((p) => [
      p.id,
      `${p.code} · ${p.name}${p.archived_at ? " (archived)" : ""}`,
    ]),
  );
  const units = new Map(context.units.map((u) => [u.id, u.unit_number]));
  const people = new Map(context.people.map((p) => [p.id, p.display_name]));
  const feesOnly = viewQuery.report === "management-fees";
  const scoped = entries.filter(
    (e) =>
      properties.has(e.propertyId) &&
      (!feesOnly || e.type === "management-fee") &&
      (viewQuery.propertyId === "all" ||
        e.propertyId === viewQuery.propertyId) &&
      (viewQuery.unitId === "all" || e.unitId === viewQuery.unitId) &&
      e.date >= period.start &&
      e.date <= period.end,
  );
  const query = viewQuery.query?.trim().toLocaleLowerCase();
  const visible = scoped
    .filter(
      (e) =>
        (!viewQuery.transactionType ||
          viewQuery.transactionType === "all" ||
          e.type === viewQuery.transactionType) &&
        (!viewQuery.transactionStatus ||
          viewQuery.transactionStatus === "all" ||
          e.status === viewQuery.transactionStatus) &&
        (!viewQuery.payeeId ||
          viewQuery.payeeId === "all" ||
          e.payeeId === viewQuery.payeeId) &&
        (!query ||
          [
            e.description,
            properties.get(e.propertyId),
            e.unitId && units.get(e.unitId),
            e.payeeLabel,
            e.category,
            e.reference,
            e.paidFrom,
            e.payeeId && people.get(e.payeeId),
            typeLabels[e.type],
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const kinds = (
    feesOnly ? ["management-fee"] : Object.keys(typeLabels)
  ) as TransactionType[];
  const money = (amount: bigint) => `$${formatExactCents(amount)}`;
  return {
    kind: viewQuery.report,
    title: feesOnly ? "Management fees" : "Transactions",
    description: feesOnly
      ? "Actual incurred management fee occurrences, including signed corrections. These are not vendor cash payments."
      : "Rent charges, company receipts and paid costs are separate financial measures. Company receipts are invoice payments received by the company, may cover non-rent invoice lines and exclude direct owner collection confirmations. Paid costs use cash allocation lines; each source line is counted once.",
    emptyTitle: "No matching transactions",
    emptyDescription:
      "Adjust the date range or filters to see recorded activity.",
    exportFilenameBase: feesOnly ? "management-fees" : "transactions",
    generatedAt: new Date().toISOString(),
    periodLabel: `${period.start} – ${period.end}`,
    scopeLabel:
      viewQuery.propertyId === "all"
        ? "All permitted properties"
        : (properties.get(viewQuery.propertyId) ?? "Selected property"),
    columns: [
      { key: "date", label: "Date" },
      { key: "property", label: "Property" },
      { key: "unit", label: "Unit" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "payee", label: "Payee" },
      { key: "description", label: "Description" },
      { key: "category", label: "Category / account" },
      { key: "reference", label: "Reference" },
      { key: "paidFrom", label: "Paid from" },
      ...kinds.map((type) => ({
        key: amountKeys[type],
        label: typeLabels[type],
        align: "right" as const,
        numeric: true,
      })),
      { key: "amount", label: "Amount", align: "right", numeric: true },
    ],
    filterOptions: {
      types: kinds.map((id) => ({ id, label: typeLabels[id] })),
      statuses: [...new Set(scoped.map((e) => e.status))].map((id) => ({
        id,
        label: id[0].toUpperCase() + id.slice(1),
      })),
      payees: [
        ...new Set(scoped.flatMap((e) => (e.payeeId ? [e.payeeId] : []))),
      ].map((id) => ({ id, label: people.get(id) ?? "Unknown payee" })),
    },
    rows: visible.map((e) => ({
      id: e.id,
      title: e.description,
      propertyId: e.propertyId,
      href: e.href,
      sourceCount: 1,
      sourceSummary: "1 authoritative source line",
      sourceLinks: [
        {
          id: e.sourceId ?? e.id,
          href: e.href,
          recordType: e.recordType,
          label: e.description,
          detail: `${e.date} · ${typeLabels[e.type]} · ${money(e.amountCents)}`,
        },
      ],
      amounts: {
        [amountKeys[e.type]]: formatExactCents(e.amountCents),
        amount: formatExactCents(e.amountCents),
      },
      cells: {
        date: e.date,
        amount: money(e.amountCents),
        property: properties.get(e.propertyId) ?? "Unknown property",
        unit: e.unitId
          ? (units.get(e.unitId) ?? "Unknown unit")
          : "Property level",
        type: typeLabels[e.type],
        status: e.status[0].toUpperCase() + e.status.slice(1),
        payee:
          e.payeeLabel ||
          (e.payeeId ? (people.get(e.payeeId) ?? "Unknown payee") : "—"),
        category: e.category ?? "—",
        reference: e.reference ?? "—",
        paidFrom: e.paidFrom ?? "—",
        description: e.description,
        ...Object.fromEntries(
          kinds.map((type) => [
            amountKeys[type],
            type === e.type ? money(e.amountCents) : "—",
          ]),
        ),
      },
    })),
    summary: kinds.map((type) => {
      const sources = visible.filter((e) => e.type === type);
      return {
        label: typeLabels[type],
        value: money(
          sources.reduce((sum, e) => sum + e.amountCents, BigInt(0)),
        ),
        sourceCount: sources.length,
        detail: `${sources.length} source lines; signed reversals included`,
      };
    }),
    totalsTraceLabel: `${visible.length} source lines. Charges, receipts, paid costs and incurred fees are never combined.`,
    totalRowCount: visible.length,
  };
}
function accountHref(propertyId: string, date: string) {
  return `/properties/${encodeURIComponent(propertyId)}/account?month=${date.slice(0, 7)}`;
}

async function enrichPaidCosts(
  supabase: Client,
  organizationId: string,
  propertyId: string,
  entries: TransactionReportEntry[],
) {
  // Child submissions point to the authoritative payment allocation, including reversals.
  // Parent transaction amounts are never used, even for multi-property transactions.
  const submissions = await loadTransactionReportPages((from, to) =>
    supabase
      .from("expense_submissions")
      .select(
        "id, approved_payment_allocation_id, reversal_payment_allocation_id, vendor_label, vendor_person_id",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("id")
      .range(from, to),
  );
  const entriesBySource = new Map(entries.map((e) => [e.sourceId, e]));
  const matched = submissions.filter(
    (s) =>
      entriesBySource.has(s.approved_payment_allocation_id ?? "") ||
      entriesBySource.has(s.reversal_payment_allocation_id ?? ""),
  );
  for (let offset = 0; offset < matched.length; offset += PAGE_SIZE) {
    const batch = matched.slice(offset, offset + PAGE_SIZE);
    const lines = await loadTransactionReportPages((from, to) =>
      supabase
        .from("expense_transaction_lines")
        .select(
          "id, submission_id, transaction_id, category_account_id, description",
          { count: "exact" },
        )
        .eq("organization_id", organizationId)
        .in(
          "submission_id",
          batch.map((s) => s.id),
        )
        .order("id")
        .range(from, to),
    );
    const transactionIds = [...new Set(lines.map((l) => l.transaction_id))];
    const parents = transactionIds.length
      ? await loadTransactionReportPages((from, to) =>
          supabase
            .from("expense_transactions")
            .select(
              "id, pay_from_account_id, payee_label, external_payee_label, payee_person_id, reference",
              { count: "exact" },
            )
            .eq("organization_id", organizationId)
            .in("id", transactionIds)
            .order("id")
            .range(from, to),
        )
      : [];
    if (parents.length !== transactionIds.length)
      throw new Error("Expense transaction metadata is incomplete.");
    const accountIds = [
      ...new Set([
        ...lines.map((l) => l.category_account_id),
        ...parents.map((p) => p.pay_from_account_id),
      ]),
    ];
    const accounts = accountIds.length
      ? await loadTransactionReportPages((from, to) =>
          supabase
            .from("finance_accounts")
            .select("id, account_number, display_name", { count: "exact" })
            .eq("organization_id", organizationId)
            .in("id", accountIds)
            .order("id")
            .range(from, to),
        )
      : [];
    if (accounts.length !== accountIds.length)
      throw new Error("Expense account metadata is incomplete.");
    const accountLabel = (id: string) => {
      const account = accounts.find((a) => a.id === id);
      return account
        ? [account.account_number, account.display_name]
            .filter(Boolean)
            .join(" · ")
        : undefined;
    };
    for (const submission of batch) {
      const line = lines.find((l) => l.submission_id === submission.id);
      const parent = parents.find((p) => p.id === line?.transaction_id);
      for (const sourceId of [
        submission.approved_payment_allocation_id,
        submission.reversal_payment_allocation_id,
      ]) {
        const entry = entriesBySource.get(sourceId ?? "");
        if (!entry) continue;
        entry.payeeId = parent?.payee_person_id ?? submission.vendor_person_id;
        entry.payeeLabel =
          parent?.external_payee_label ||
          parent?.payee_label ||
          submission.vendor_label;
        if (line) {
          entry.description = line.description;
          entry.category = accountLabel(line.category_account_id);
        }
        if (parent) {
          entry.reference = parent.reference;
          entry.paidFrom = accountLabel(parent.pay_from_account_id);
        }
      }
    }
  }
}
