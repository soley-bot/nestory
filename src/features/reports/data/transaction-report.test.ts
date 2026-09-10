import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertTransactionRpcPage,
  buildTransactionReport,
  getTransactionReport,
  loadTransactionReportPages,
  type TransactionReportEntry,
} from "./transaction-report";
import type { ReportsViewQuery } from "../reports.types";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { createSupabaseServerClient } from "@/lib/db/server";

const events = vi.hoisted(() => ({
  profit: [] as Record<string, unknown>[],
  cash: [] as Record<string, unknown>[],
  calls: [] as unknown[],
  fail: false,
}));
vi.mock("./owner-profit-loss-events", () => ({
  iterateOwnerProfitLossEvents: async function* (_: unknown, scope: unknown) {
    events.calls.push(scope);
    if (events.fail) throw new Error("RPC denied");
    yield* events.profit;
  },
}));
vi.mock("@/features/finance/data/property-cash-events", () => ({
  iteratePropertyCashEvents: async function* (_: unknown, scope: unknown) {
    events.calls.push(scope);
    yield* events.cash;
  },
}));
const context: ScopedFinanceContext = {
  properties: [
    { id: "p1", code: "P1", name: "River", archived_at: null },
    { id: "p2", code: "P2", name: "Hill", archived_at: null },
  ],
  units: [
    { id: "u1", property_id: "p1", unit_number: "101", archived_at: null },
  ],
  people: [
    {
      id: "vendor",
      display_name: "Cleaner",
      party_type: "organization",
      archived_at: null,
    },
  ],
  owner_assignments: [],
  leases: [],
  terms: [],
  billing_terms: [],
};
function query(overrides: Partial<ReportsViewQuery> = {}): ReportsViewQuery {
  return {
    month: "2026-09",
    propertyId: "p1",
    unitId: "all",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    report: "transactions",
    status: "all",
    ...overrides,
  };
}
function entry(
  overrides: Partial<TransactionReportEntry> = {},
): TransactionReportEntry {
  return {
    id: "line",
    date: "2026-09-08",
    propertyId: "p1",
    unitId: "u1",
    type: "paid-cost",
    status: "recorded",
    description: "Cleaning",
    amountCents: BigInt(101),
    payeeId: "vendor",
    href: "/properties/p1/account?month=2026-09",
    recordType: "payment-allocation",
    ...overrides,
  };
}
function build(
  entries: TransactionReportEntry[],
  overrides: Partial<ReportsViewQuery> = {},
) {
  return buildTransactionReport({
    entries,
    context,
    viewQuery: query(overrides),
    period: { start: "2026-09-01", end: "2026-09-30" },
  });
}

describe("transaction report financial presentation", () => {
  it("retains archived property activity in historical totals", () => {
    const report = buildTransactionReport({
      entries: [entry()],
      context: {
        ...context,
        properties: context.properties.map((p) => ({
          ...p,
          archived_at: "2026-09-09",
        })),
      },
      viewQuery: query(),
      period: { start: "2026-09-01", end: "2026-09-30" },
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].cells.property).toContain("(archived)");
    expect(report.summary.find((m) => m.label === "Paid cost")?.value).toBe(
      "$1.01",
    );
  });
  it("keeps split source lines and exact signed totals separate from charges and incurred fees", () => {
    const report = build([
      entry({ id: "split-1", amountCents: BigInt(10) }),
      entry({ id: "split-2", amountCents: BigInt(20) }),
      entry({ id: "reversal", amountCents: BigInt(-10), status: "reversal" }),
      entry({ id: "charge", type: "rent-charge", amountCents: BigInt(10000) }),
      entry({ id: "receipt", type: "receipt", amountCents: BigInt(6000) }),
      entry({ id: "fee", type: "management-fee", amountCents: BigInt(1000) }),
    ]);
    expect(report.summary.map((m) => m.value)).toEqual([
      "$100.00",
      "$60.00",
      "$0.20",
      "$10.00",
    ]);
    expect(report.rows).toHaveLength(6);
    expect(report.rows.find((r) => r.id === "charge")?.amounts).toEqual({
      rentCharges: "100.00",
      amount: "100.00",
    });
    expect(report.rows.find((r) => r.id === "charge")?.cells.receipts).toBe(
      "—",
    );
    expect(report.rows.every((r) => r.sourceLinks[0].href)).toBe(true);
  });
  it("filters property, unit, dates, type, status, payee and search before totals", () => {
    const report = build(
      [
        entry(),
        entry({ id: "foreign", propertyId: "p2" }),
        entry({ id: "property-level", unitId: null }),
        entry({ id: "old", date: "2026-08-01" }),
        entry({ id: "other-type", type: "receipt" }),
        entry({ id: "reverse", status: "reversal" }),
        entry({ id: "other-vendor", payeeId: "other" }),
      ],
      {
        unitId: "u1",
        transactionType: "paid-cost",
        transactionStatus: "recorded",
        payeeId: "vendor",
        query: "cleaner",
      },
    );
    expect(report.rows.map((r) => r.id)).toEqual(["line"]);
    expect(report.summary.find((m) => m.label === "Paid cost")?.value).toBe(
      "$1.01",
    );
  });
  it("fee report exposes occurrences only, with no inferred vendor", () => {
    const report = build(
      [
        entry(),
        entry({
          id: "fee",
          type: "management-fee",
          status: "incurred",
          payeeId: null,
        }),
      ],
      { report: "management-fees" },
    );
    expect(report.rows).toHaveLength(1);
    expect(report.summary).toHaveLength(1);
    expect(report.filterOptions?.payees).toEqual([]);
    expect(report.rows[0].cells.payee).toBe("—");
  });
});

describe("complete bounded source pagination", () => {
  it("rejects RPC transport truncation and unknown completeness", () => {
    expect(() =>
      assertTransactionRpcPage({ data: [{}], count: 500, error: null }),
    ).toThrow("incomplete");
    expect(() =>
      assertTransactionRpcPage({ data: [], count: null, error: null }),
    ).toThrow("incomplete");
    expect(() =>
      assertTransactionRpcPage({ data: [], count: 0, error: null }),
    ).not.toThrow();
  });
  it("rejects changing and unknown table counts", async () => {
    await expect(
      loadTransactionReportPages(async () => ({
        data: [],
        count: null,
        error: null,
      })),
    ).rejects.toThrow("count is unavailable");
    await expect(
      loadTransactionReportPages(async (from) => ({
        data: [{ id: String(from) }],
        count: from === 0 ? 3 : 4,
        error: null,
      })),
    ).rejects.toThrow("count changed");
  });
  it("continues after a capped page until the exact count is reached", async () => {
    const fetch = vi.fn(async (from: number) => ({
      error: null,
      count: 500,
      data:
        from < 500
          ? Array.from({ length: 250 }, (_, i) => ({ id: String(from + i) }))
          : [],
    }));
    expect(await loadTransactionReportPages(fetch)).toHaveLength(500);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([0, 250]);
  });
  it("fails on a later source error instead of returning partial totals", async () => {
    await expect(
      loadTransactionReportPages(async (from) =>
        from === 0
          ? {
              error: null,
              count: 501,
              data: Array.from({ length: 500 }, (_, i) => ({ id: String(i) })),
            }
          : { error: { message: "denied" }, data: null, count: null },
      ),
    ).rejects.toThrow("denied");
  });
  it("rejects repeated source IDs and excessive rows", async () => {
    await expect(
      loadTransactionReportPages(async () => ({
        error: null,
        data: [{ id: "a" }, { id: "a" }],
        count: 2,
      })),
    ).rejects.toThrow("repeated");
    await expect(
      loadTransactionReportPages(async (from) => ({
        error: null,
        data: Array.from({ length: 500 }, (_, i) => ({ id: String(from + i) })),
        count: 10001,
      })),
    ).rejects.toThrow("10,000");
  });
});

type RecordRow = Record<string, unknown>;
function client(tables: Record<string, RecordRow[]> = {}) {
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  const api = {
    from(table: string) {
      const call = { table, filters: [] as [string, unknown][] };
      calls.push(call);
      const chain = {
        select() {
          return chain;
        },
        eq(k: string, v: unknown) {
          call.filters.push([k, v]);
          return chain;
        },
        in(k: string, v: unknown) {
          call.filters.push([k, v]);
          return chain;
        },
        gte(k: string, v: unknown) {
          call.filters.push([`gte:${k}`, v]);
          return chain;
        },
        lte(k: string, v: unknown) {
          call.filters.push([`lte:${k}`, v]);
          return chain;
        },
        order() {
          return chain;
        },
        async range(from: number, to: number) {
          return {
            data: (tables[table] ?? []).slice(from, to + 1),
            count: (tables[table] ?? []).length,
            error: null,
          };
        },
      };
      return chain;
    },
  };
  return {
    api: api as unknown as Awaited<
      ReturnType<typeof createSupabaseServerClient>
    >,
    calls,
  };
}
beforeEach(() => {
  events.profit = [];
  events.cash = [];
  events.calls = [];
  events.fail = false;
});
describe("transaction loader source authority", () => {
  it("uses scoped invoice headers only as metadata and counts signed receipts once", async () => {
    const { api, calls } = client({
      tenant_invoices: [
        {
          id: "invoice",
          organization_id: "org",
          property_id: "p1",
          unit_id: "u1",
          lease_id: "lease",
          invoice_number: "INV-1",
        },
      ],
      tenant_invoice_payments: [
        {
          id: "pay",
          organization_id: "org",
          invoice_id: "invoice",
          amount: "10.20",
          currency: "USD",
          received_date: "2026-09-08",
          receipt_number: "REC-1",
          reference: null,
          reversal_of_id: null,
        },
        {
          id: "reverse",
          organization_id: "org",
          invoice_id: "invoice",
          amount: "-0.20",
          currency: "USD",
          received_date: "2026-09-09",
          receipt_number: "REC-2",
          reference: null,
          reversal_of_id: "pay",
        },
      ],
    });
    const report = await getTransactionReport({
      organizationId: "org",
      viewQuery: query(),
      financeContext: context,
      supabase: api,
    });
    expect(report.rows).toHaveLength(2);
    expect(
      report.summary.find((m) => m.label === "Company receipts")?.value,
    ).toBe("$10.00");
    expect(calls[0].filters).toContainEqual(["property_id", "p1"]);
    expect(
      calls.every((c) =>
        c.filters.some(([k, v]) => k === "organization_id" && v === "org"),
      ),
    ).toBe(true);
    expect(calls[1].filters).toContainEqual(["invoice_id", ["invoice"]]);
    expect(events.calls[0]).toMatchObject({
      organizationId: "org",
      propertyId: "p1",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    });
  });
  it("uses modern child allocations once and enriches external payee, category and funding account", async () => {
    events.cash = [
      {
        sourceType: "payment_allocation",
        sourceId: "allocation",
        categoryCode: "company_cost",
        economicClass: "adjustment",
        resolutionState: "resolved",
        operatingCashEffectCents: BigInt(0),
        amountCents: BigInt(-10025),
        eventKey: "payment_allocation:allocation",
        eventDate: "2026-09-08",
        propertyId: "p1",
        unitId: "u1",
        isReversal: false,
        description: "Original",
        vendorPersonId: null,
      },
    ];
    const { api } = client({
      expense_submissions: [
        {
          id: "child",
          approved_payment_allocation_id: "allocation",
          reversal_payment_allocation_id: null,
          vendor_label: "Old name",
          vendor_person_id: null,
        },
      ],
      expense_transaction_lines: [
        {
          id: "line",
          submission_id: "child",
          transaction_id: "parent",
          category_account_id: "category",
          description: "Paid cleaning",
        },
      ],
      expense_transactions: [
        {
          id: "parent",
          pay_from_account_id: "bank",
          payee_label: "External",
          external_payee_label: "PAT PUTHEA",
          payee_person_id: null,
          reference: "REF-25",
        },
      ],
      finance_accounts: [
        { id: "category", account_number: "6000", display_name: "Cleaning" },
        { id: "bank", account_number: "1001", display_name: "ABA" },
      ],
    });
    const report = await getTransactionReport({
      organizationId: "org",
      viewQuery: query({ transactionType: "paid-cost" }),
      financeContext: context,
      supabase: api,
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].cells).toMatchObject({
      paidCosts: "$100.25",
      payee: "PAT PUTHEA",
      category: "6000 · Cleaning",
      paidFrom: "1001 · ABA",
      reference: "REF-25",
      description: "Paid cleaning",
    });
    expect(report.rows[0].sourceLinks[0].id).toBe("allocation");
  });
  it("skips unrelated sources when a transaction type is selected", async () => {
    const { api, calls } = client();
    await getTransactionReport({
      organizationId: "org",
      viewQuery: query({ transactionType: "management-fee" }),
      financeContext: context,
      supabase: api,
    });
    expect(events.calls).toHaveLength(1);
    expect(calls).toEqual([]);
  });
  it("rejects inaccessible scope and source failures", async () => {
    const { api } = client();
    await expect(
      getTransactionReport({
        organizationId: "org",
        viewQuery: query({ propertyId: "forbidden" }),
        financeContext: context,
        supabase: api,
      }),
    ).rejects.toThrow("permitted scope");
    events.fail = true;
    await expect(
      getTransactionReport({
        organizationId: "org",
        viewQuery: query(),
        financeContext: context,
        supabase: api,
      }),
    ).rejects.toThrow("RPC denied");
  });
  it("does not load cash or invoice parents for fee-only reports", async () => {
    events.profit = [
      {
        sourceType: "management_fee_occurrence",
        eventKey: "fee:1",
        recognizedOn: "2026-09-08",
        propertyId: "p1",
        unitId: "u1",
        isReversal: false,
        description: "Actual fee",
        signedAmountCents: BigInt(125),
        leaseId: "lease",
      },
    ];
    const { api, calls } = client();
    const report = await getTransactionReport({
      organizationId: "org",
      viewQuery: query({ report: "management-fees" }),
      financeContext: context,
      supabase: api,
    });
    expect(report.summary[0].value).toBe("$1.25");
    expect(calls).toEqual([]);
    expect(events.calls).toHaveLength(1);
  });
  it("preserves cash reversal effects and rejects unresolved paid costs", async () => {
    const { api } = client();
    events.cash = [
      {
        economicClass: "operating_expense",
        resolutionState: "resolved",
        amountCents: BigInt(120),
        operatingCashEffectCents: BigInt(120),
        eventKey: "reversal:1",
        eventDate: "2026-09-08",
        propertyId: "p1",
        unitId: "u1",
        isReversal: true,
        description: "Refund",
        vendorPersonId: "vendor",
      },
    ];
    const report = await getTransactionReport({
      organizationId: "org",
      viewQuery: query(),
      financeContext: context,
      supabase: api,
    });
    expect(report.summary.find((m) => m.label === "Paid cost")?.value).toBe(
      "$-1.20",
    );
    events.cash[0].resolutionState = "unresolved";
    await expect(
      getTransactionReport({
        organizationId: "org",
        viewQuery: query(),
        financeContext: context,
        supabase: api,
      }),
    ).rejects.toThrow("unresolved");
  });
});
