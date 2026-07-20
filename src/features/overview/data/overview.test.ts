import { describe, expect, it, vi } from "vitest";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { buildOwnerStatement } from "@/features/reports/data/owner-statement";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getOverviewScreenData", () => {
  it("marks a brand new workspace as not yet set up", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({ tasks: { count: 0, data: [] } }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.workspaceSetup).toEqual({
      activeLeaseCount: 0,
      hasAnyOperatingData: false,
      ledgerEntryCount: 0,
      peopleCount: 0,
      propertyCount: 0,
      unitCount: 0,
    });
    expect(data.quickActions[0]).toEqual({
      href: "/import",
      label: "Import data",
    });
  });

  it("surfaces open maintenance work as a dashboard attention item", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        properties: {
          data: [{ code: "CTR", id: "prop-1", name: "Central Residence" }],
        },
        property_owners: {
          data: [ownerLinkRow()],
        },
        tasks: {
          data: [
            {
              due_date: "2026-07-01",
              id: "task-1",
              priority: "urgent",
              property_id: "prop-1",
              status: "pending",
              title: "Leaking pipe",
            },
            {
              due_date: null,
              id: "task-2",
              priority: "normal",
              property_id: "prop-1",
              status: "scheduled",
              title: "Inspect pump",
            },
          ],
        },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.attentionItems).toContainEqual(
      expect.objectContaining({
        actionLabel: "Review maintenance",
        count: 2,
        helper: "Open cases",
        href: "/maintenance?review=open",
        id: "open-maintenance",
        kind: "urgent-maintenance",
        label: "Open maintenance",
        priority: 70,
        tone: "warning",
      }),
    );
    expect(data.attentionTotal).toBe(2);
    expect(data.dashboardSummary.actionHref).toBe("#focus-now");
    expect(data.workspaceSetup.hasAnyOperatingData).toBe(true);
    expect(data.maintenanceByProperty).toEqual([
      expect.objectContaining({
        label: "CTR / Central Residence",
        openCount: 2,
        urgentCount: 1,
      }),
    ]);
    expect(data.maintenanceByProperty[0].cases[0]).toEqual(
      expect.objectContaining({ title: "Leaking pipe" }),
    );
  });

  it("links missing lease tenant records to the lease repair view", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        leases: {
          data: [
            {
              lease_end_date: "2099-01-01",
              primary_tenant_person_id: null,
              unit_id: null,
            },
          ],
        },
        tasks: { count: 0, data: [] },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.attentionItems).toContainEqual(
      expect.objectContaining({
        actionLabel: "Link tenants",
        count: 1,
        helper: "No People tenant link",
        href: "/leases?status=current&tenantStatus=missing",
        id: "missing-tenant-links",
        kind: "data-quality",
        label: "Leases missing tenant link",
        priority: 100,
        tone: "warning",
      }),
    );
    expect(data.dashboardSummary.actionHref).toBe(
      "/leases?status=current&tenantStatus=missing",
    );
  });

  it("loads selected-month property cash performance from settlement events", async () => {
    const queryCalls: QueryCall[] = [];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        finance_expense_items: {
          data: [
            {
              amount: 300,
              category: "Maintenance",
              company_loss_amount: 0,
              currency: "USD",
              economic_scope: "property_expense",
              expense_type: "maintenance",
              id: "expense-1",
              invoice_date: "2026-07-04",
              owner_bill_status: "not_billable",
              owner_reimbursable_amount: 0,
              owner_reimbursed_amount: 0,
              property_id: "prop-1",
              status: "paid",
              vendor_label: "Vendor 1",
            },
            {
              amount: 100,
              category: "Utilities",
              company_loss_amount: 0,
              currency: "USD",
              economic_scope: "property_expense",
              expense_type: "utilities",
              id: "expense-2",
              invoice_date: "2026-07-05",
              owner_bill_status: "not_billable",
              owner_reimbursable_amount: 0,
              owner_reimbursed_amount: 0,
              property_id: "prop-1",
              status: "paid",
              vendor_label: "Vendor 2",
            },
            {
              amount: 60.6,
              category: "Tax",
              company_loss_amount: 0,
              currency: "USD",
              economic_scope: "property_expense",
              expense_type: "tax",
              id: "expense-3",
              invoice_date: "2026-07-06",
              owner_bill_status: "not_billable",
              owner_reimbursable_amount: 0,
              owner_reimbursed_amount: 0,
              property_id: "prop-1",
              status: "paid",
              vendor_label: "Vendor 3",
            },
          ],
        },
        finance_income_items: {
          data: [
            {
              amount_due: 1400,
              amount_received: 1400,
              currency: "USD",
              due_date: "2026-07-01",
              id: "income-rent",
              income_type: "rent",
              property_id: "prop-1",
              status: "paid",
            },
            {
              amount_due: 112,
              amount_received: 112,
              currency: "USD",
              due_date: "2026-07-01",
              id: "income-fee",
              income_type: "management_fee",
              property_id: "prop-1",
              status: "paid",
            },
          ],
        },
        finance_payment_allocations: {
          data: [
            paymentAllocation("payment-allocation-1", "expense-1", 300, "2026-07-04"),
            paymentAllocation("payment-allocation-2", "expense-2", 100, "2026-07-05"),
            paymentAllocation("payment-allocation-3", "expense-3", 60.6, "2026-07-06"),
          ],
        },
        finance_receipt_allocations: {
          data: [
            receiptAllocation("receipt-allocation-1", "income-rent", 1400),
            receiptAllocation("receipt-allocation-2", "income-fee", 112),
          ],
        },
        lease_deposit_events: {
          data: [
            {
              amount: 1400,
              event_date: "2026-06-20",
              event_type: "received",
              id: "deposit-event-1",
              property_id: "prop-1",
              reversal_of_id: null,
            },
            {
              amount: 200,
              event_date: "2026-06-21",
              event_type: "refunded",
              id: "deposit-event-2",
              property_id: "prop-1",
              reversal_of_id: null,
            },
            {
              amount: 200,
              event_date: "2026-06-22",
              event_type: "reversed",
              id: "deposit-event-3",
              property_id: "prop-1",
              reversal_of_id: "deposit-event-2",
            },
          ],
        },
        properties: {
          data: [{ code: "CTR", id: "prop-1", name: "Central Residence" }],
        },
        tasks: { count: 0, data: [] },
        units: {
          data: [{ id: "unit-1", property_id: "prop-1", status: "occupied" }],
        },
      }, queryCalls),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      {
        financeView: "collections",
        lens: "all",
        month: "2026-07",
        propertyId: "prop-1",
        review: "all",
      },
    );

    expect(data.propertyPerformance.rows[0]).toMatchObject({
      cashExpensesAmount: 572.6,
      cashIncomeAmount: 1400,
      netCashAmount: 827.4,
      propertyId: "prop-1",
      securityDepositHeldAmount: 1400,
    });
    expect(data.propertyPerformance.summary.managementFeeEarnedAmount).toBe(112);
    expect(data).not.toHaveProperty("companyFinance");
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: ["id", "prop-1"], method: "eq", table: "properties" }),
        expect.objectContaining({ args: ["finance_receipts.property_id", "prop-1"], method: "eq", table: "finance_receipt_allocations" }),
        expect.objectContaining({ args: ["finance_income_items.property_id", "prop-1"], method: "eq", table: "finance_receipt_allocations" }),
        expect.objectContaining({ args: ["finance_payments.property_id", "prop-1"], method: "eq", table: "finance_payment_allocations" }),
        expect.objectContaining({ args: ["finance_expense_items.property_id", "prop-1"], method: "eq", table: "finance_payment_allocations" }),
        expect.objectContaining({ args: ["property_id", "prop-1"], method: "eq", table: "lease_deposit_events" }),
        expect.objectContaining({
          args: ["id, property_id, event_date, event_type, amount, reversal_of_id"],
          method: "select",
          table: "lease_deposit_events",
        }),
        expect.objectContaining({ args: ["income_item_id", ["income-rent", "income-fee"]], method: "in", table: "finance_receipt_allocations" }),
        expect.objectContaining({ args: ["finance_receipts.received_date", "2026-08-01"], method: "lt", table: "finance_receipt_allocations" }),
      ]),
    );
  });

  it("loads every page of due obligations and open-bill blockers", async () => {
    const dueItems = Array.from({ length: 1_001 }, (_, index) => ({
      amount_due: 1,
      due_date: "2026-07-01",
      id: `income-${index}`,
      income_type: "rent",
      property_id: "prop-1",
    }));
    const openBills = Array.from({ length: 1_001 }, (_, index) => ({
      economic_scope: "property_expense",
      expense_type: "maintenance",
      id: `bill-${index}`,
      property_id: "prop-1",
    }));
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        finance_expense_items: { data: openBills },
        finance_income_items: { data: dueItems },
        properties: {
          data: [{ code: "CTR", id: "prop-1", name: "Central Residence" }],
        },
        tasks: { count: 0, data: [] },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      {
        financeView: "collections",
        lens: "all",
        month: "2026-07",
        propertyId: "all",
        review: "all",
      },
    );

    expect(data.propertyPerformance.rows[0].arrearsAmount).toBe(1_001);
    expect(data.attentionItems).toContainEqual(
      expect.objectContaining({ count: 1_001, label: "Open property bills" }),
    );
  });

  it("matches authoritative readiness for one single-owner and one 60/40 property", async () => {
    const properties = [
      { code: "ONE", id: "property-one", name: "Single Owner" },
      { code: "TWO", id: "property-two", name: "Shared Owners" },
    ];
    const ownerLinks = [
      ownerLinkRow({ id: "link-one", person_id: "person-one", property_id: "property-one" }),
      ownerLinkRow({
        id: "link-two-a",
        ownership_percent: 60,
        person_id: "person-two",
        property_id: "property-two",
      }),
      ownerLinkRow({
        id: "link-two-b",
        is_primary: false,
        ownership_percent: 40,
        person_id: "person-three",
        property_id: "property-two",
      }),
    ];
    const people = [
      personRow("person-one", "Owner One"),
      personRow("person-two", "Owner Two"),
      personRow("person-three", "Owner Three"),
    ];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        people: { data: people },
        properties: { data: properties },
        property_owners: { data: ownerLinks },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      overviewQuery(),
    );
    const authoritative = buildOwnerStatement({
      cashInput: {
        depositEvents: [],
        expenseItems: [],
        incomeItems: [],
        monthScope: { before: "2026-08-01", from: "2026-07-01" },
        paymentAllocations: [],
        propertyIds: properties.map((property) => property.id),
        receiptAllocations: [],
      },
      ownerLinks: ownerLinks.map(toDomainOwnerLink),
      people: people.map((person) => ({
        displayName: person.display_name,
        hasUsableContact: true,
        id: person.id,
      })),
    });

    expect(authoritative.summary).toMatchObject({
      blockedPropertyCount: 0,
      readyPropertyCount: 2,
      readyStatementCount: 3,
    });
    expect(data.propertyPerformance.summary.statementReadiness).toEqual({
      blockedPropertyCount: authoritative.summary.blockedPropertyCount,
      readyPropertyCount: authoritative.summary.readyPropertyCount,
      readyStatementCount: authoritative.summary.readyStatementCount,
      totalPropertyCount: 2,
    });
    expect(data.recordsByProperty).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ONE / Single Owner",
          readyStatementCount: 1,
          statementBlockers: 0,
        }),
        expect.objectContaining({
          label: "TWO / Shared Owners",
          readyStatementCount: 2,
          statementBlockers: 0,
        }),
      ]),
    );
  });

  it("filters Records rows to blocked properties without narrowing portfolio readiness", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        people: { data: [personRow("person-ready", "Ready Owner")] },
        properties: {
          data: [
            { code: "BAD", id: "property-blocked", name: "Blocked" },
            { code: "GOOD", id: "property-ready", name: "Ready" },
          ],
        },
        property_owners: {
          data: [
            ownerLinkRow({
              id: "owner-link-ready",
              person_id: "person-ready",
              property_id: "property-ready",
            }),
          ],
        },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      overviewQuery({ review: "statement-blocked" }),
    );

    expect(data.recordsByProperty.map((row) => row.label)).toEqual([
      "BAD / Blocked",
    ]);
    expect(data.propertyPerformance.summary.statementReadiness).toEqual({
      blockedPropertyCount: 1,
      readyPropertyCount: 1,
      readyStatementCount: 1,
      totalPropertyCount: 2,
    });
    expect(data.attentionItems).toContainEqual(
      expect.objectContaining({
        count: 1,
        label: "Blocked properties",
      }),
    );
  });

  it.each([
    {
      label: "has a current primary link that starts after the period begins",
      links: [ownerLinkRow({ started_on: "2026-07-15" })],
    },
    {
      label: "has overlapping links for the same owner",
      links: [
        ownerLinkRow(),
        ownerLinkRow({ id: "owner-link-overlap", started_on: "2026-07-10" }),
      ],
    },
  ])("blocks a property whose dated ownership roster $label", async ({ links }) => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        people: { data: [personRow("owner-person-1", "Owner One")] },
        properties: {
          data: [{ code: "P1", id: "prop-1", name: "Property One" }],
        },
        property_owners: { data: links },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      overviewQuery(),
    );

    expect(data.recordsByProperty[0]).toMatchObject({
      ownerLinked: true,
      readyStatementCount: 0,
      statementBlockers: 1,
    });
    expect(data.propertyPerformance.summary.statementReadiness).toMatchObject({
      blockedPropertyCount: 1,
      readyPropertyCount: 0,
      readyStatementCount: 0,
    });
  });

  it.each(["contribution", "payout"] as const)(
    "surfaces an ambiguous owner %s as an authoritative statement blocker",
    async (transfer) => {
      const ownerLinks = [
        ownerLinkRow({ ownership_percent: 60 }),
        ownerLinkRow({
          id: "owner-link-2",
          is_primary: false,
          ownership_percent: 40,
          person_id: "owner-person-2",
        }),
      ];
      const transferItem = {
        economic_scope: "property_expense",
        expense_type: "owner_payout",
        id: "transfer",
        ledger_entry_id: null,
        property_id: "prop-1",
        status: "paid",
      };
      vi.mocked(createSupabaseServerClient).mockResolvedValue(
        createSupabaseStub({
          finance_expense_items: {
            data: transfer === "payout" ? [transferItem] : [],
          },
          finance_income_items: {
            data:
              transfer === "contribution"
                ? [
                    {
                      amount_due: 100,
                      due_date: "2026-07-01",
                      id: "transfer",
                      income_type: "owner_contribution",
                      property_id: "prop-1",
                    },
                  ]
                : [],
          },
          finance_payment_allocations: {
            data:
              transfer === "payout"
                ? [
                    {
                      ...paymentAllocation(
                        "payment-allocation-transfer",
                        "transfer",
                        100,
                        "2026-07-20",
                      ),
                      finance_expense_items: transferItem,
                    },
                  ]
                : [],
          },
          finance_receipt_allocations: {
            data:
              transfer === "contribution"
                ? [receiptAllocation("receipt-allocation-transfer", "transfer", 100)]
                : [],
          },
          people: {
            data: [
              personRow("owner-person-1", "Owner One"),
              personRow("owner-person-2", "Owner Two"),
            ],
          },
          properties: {
            data: [{ code: "P1", id: "prop-1", name: "Property One" }],
          },
          property_owners: { data: ownerLinks },
        }),
      );

      const data = await getOverviewScreenData(
        "11111111-1111-4111-8111-111111111111",
        overviewQuery(),
      );

      expect(data.recordsByProperty[0]).toMatchObject({
        readyStatementCount: 0,
        statementBlockers: 1,
      });
    },
  );

  it("isolates a malformed deposit to one property and keeps a missing-contact owner ready", async () => {
    const properties = [
      { code: "BAD", id: "property-bad", name: "Bad Deposit" },
      { code: "WARN", id: "property-warning", name: "Missing Contact" },
      { code: "GOOD", id: "property-good", name: "Ready" },
    ];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        lease_deposit_events: {
          data: [
            {
              amount: 100,
              event_date: "2026-07-22",
              event_type: "reversed",
              id: "deposit-reversal-bad",
              property_id: "property-bad",
              reversal_of_id: "missing-deposit-event",
            },
          ],
        },
        people: {
          data: [
            personRow("person-bad", "Owner Bad"),
            personRow("person-warning", "Owner Warning", null),
            personRow("person-good", "Owner Good"),
          ],
        },
        properties: { data: properties },
        property_owners: {
          data: [
            ownerLinkRow({ id: "link-bad", person_id: "person-bad", property_id: "property-bad" }),
            ownerLinkRow({ id: "link-warning", person_id: "person-warning", property_id: "property-warning" }),
            ownerLinkRow({ id: "link-good", person_id: "person-good", property_id: "property-good" }),
          ],
        },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      overviewQuery(),
    );
    const rowsByLabel = new Map(data.recordsByProperty.map((row) => [row.label, row]));

    expect(rowsByLabel.get("BAD / Bad Deposit")).toMatchObject({
      readyStatementCount: 0,
      statementBlockers: 1,
    });
    expect(rowsByLabel.get("WARN / Missing Contact")).toMatchObject({
      readyStatementCount: 1,
      statementBlockers: 0,
    });
    expect(rowsByLabel.get("GOOD / Ready")).toMatchObject({
      readyStatementCount: 1,
      statementBlockers: 0,
    });
    expect(data.propertyPerformance.summary.statementReadiness).toEqual({
      blockedPropertyCount: 1,
      readyPropertyCount: 2,
      readyStatementCount: 2,
      totalPropertyCount: 3,
    });
  });

  it("uses the selected month and property scope for the same readiness as Owner Statement", async () => {
    const queryCalls: QueryCall[] = [];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub(
        {
          people: { data: [personRow("owner-person-1", "Owner One")] },
          properties: {
            data: [{ code: "P1", id: "prop-1", name: "Property One" }],
          },
          property_owners: {
            data: [ownerLinkRow({ started_on: "2026-08-01" })],
          },
        },
        queryCalls,
      ),
    );

    const july = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      overviewQuery({ month: "2026-07", propertyId: "prop-1" }),
    );
    const august = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      overviewQuery({ month: "2026-08", propertyId: "prop-1" }),
    );

    expect(july.propertyPerformance.summary.statementReadiness).toMatchObject({
      blockedPropertyCount: 1,
      readyPropertyCount: 0,
    });
    expect(august.propertyPerformance.summary.statementReadiness).toMatchObject({
      blockedPropertyCount: 0,
      readyPropertyCount: 1,
      readyStatementCount: 1,
    });
    for (const table of [
      "properties",
      "property_owners",
      "finance_income_items",
      "lease_deposit_events",
    ]) {
      expect(queryCalls).toContainEqual(
        expect.objectContaining({
          args: [table === "properties" ? "id" : "property_id", "prop-1"],
          method: "eq",
          table,
        }),
      );
    }
  });
});

type SupabaseResult = {
  count?: number | null;
  data?: unknown[];
  error?: { message: string } | null;
};

type QueryCall = {
  args: unknown[];
  method: string;
  table: string;
};

function createSupabaseStub(
  results: Record<string, SupabaseResult>,
  calls?: QueryCall[],
) {
  return {
    from: vi.fn((table: string) =>
      createQuery(results[table] ?? { data: [] }, table, calls),
    ),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

function receiptAllocation(id: string, incomeItemId: string, amount: number) {
  return {
    amount,
    finance_receipts: {
      id: `receipt-${id}`,
      received_date: "2026-07-03",
      reversal_of_id: null,
    },
    id,
    income_item_id: incomeItemId,
  };
}

function paymentAllocation(
  id: string,
  expenseItemId: string,
  amount: number,
  paidDate: string,
) {
  return {
    amount,
    expense_item_id: expenseItemId,
    finance_expense_items: {
      economic_scope: "property_expense",
      expense_type: "property_cost",
      id: expenseItemId,
      ledger_entry_id: null,
      property_id: "prop-1",
    },
    finance_payments: {
      id: `payment-${id}`,
      paid_date: paidDate,
      reversal_of_id: null,
    },
    id,
  };
}

function createQuery(result: SupabaseResult, table = "", calls?: QueryCall[]) {
  const chain = (method: string) => (...args: unknown[]) => {
    calls?.push({ args, method, table });
    return query;
  };
  const query = {
    eq: chain("eq"),
    gte: chain("gte"),
    in: chain("in"),
    is: chain("is"),
    limit: chain("limit"),
    lt: chain("lt"),
    neq: chain("neq"),
    or: chain("or"),
    order: chain("order"),
    range: (from: number, to: number) => {
      calls?.push({ args: [from, to], method: "range", table });
      return Promise.resolve({
        count: result.count ?? null,
        data: (result.data ?? []).slice(from, to + 1),
        error: result.error ?? null,
      });
    },
    select: chain("select"),
    then: (
      onFulfilled: (value: SupabaseResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        count: result.count ?? null,
        data: (result.data ?? []).slice(0, 1_000),
        error: result.error ?? null,
      }).then(onFulfilled, onRejected),
  };

  return query;
}

function overviewQuery(
  overrides: Partial<NonNullable<Parameters<typeof getOverviewScreenData>[1]>> = {},
) {
  return {
    financeView: "collections" as const,
    lens: "records" as const,
    month: "2026-07",
    propertyId: "all",
    review: "all" as const,
    ...overrides,
  };
}

function ownerLinkRow(
  overrides: Partial<ReturnType<typeof ownerLinkRowShape>> = {},
) {
  return { ...ownerLinkRowShape(), ...overrides };
}

function ownerLinkRowShape() {
  return {
    archived_at: null as string | null,
    ended_on: null as string | null,
    id: "owner-link-1",
    is_primary: true,
    ownership_percent: null as number | null,
    person_id: "owner-person-1",
    property_id: "prop-1",
    started_on: null as string | null,
  };
}

function personRow(id: string, displayName: string, email: string | null = `${id}@example.com`) {
  return {
    display_name: displayName,
    id,
    primary_email: email,
    primary_phone: null,
  };
}

function toDomainOwnerLink(row: ReturnType<typeof ownerLinkRow>) {
  return {
    archivedAt: row.archived_at,
    endedOn: row.ended_on,
    id: row.id,
    isPrimary: row.is_primary,
    ownershipPercent: row.ownership_percent,
    personId: row.person_id,
    propertyId: row.property_id,
    startedOn: row.started_on,
  };
}
