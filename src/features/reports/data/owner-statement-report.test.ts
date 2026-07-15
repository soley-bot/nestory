import { describe, expect, it, vi } from "vitest";

import {
  buildOwnerStatement,
  type OwnerStatementInput,
} from "@/features/reports/data/owner-statement";
import { buildTrustedReportCsv } from "@/features/reports/data/csv";
import {
  buildOwnerStatementTrustedReport,
  getOwnerStatementReport,
  selectOwnerStatementRecipient,
} from "@/features/reports/data/owner-statement-report";
import type { ReportsViewQuery } from "@/features/reports/reports.types";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const propertyId = "property-1";

describe("Owner Statement trusted report adapter", () => {
  it("returns actionable validation without loading data for unit scope", async () => {
    const from = vi.fn();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      from,
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);

    const report = await getOwnerStatementReport({
      organizationId: "organization-1",
      viewQuery: {
        ...ownerStatementQuery(),
        unitId: "8b3a08d2-0898-4de3-9495-994eaf7a08dc",
      },
    });

    expect(report.scopeValidation).toEqual({
      code: "owner_statement_unit_scope",
      message:
        "Owner Statements are property-level reports. Clear the unit filter to continue.",
    });
    expect(report.emptyDescription).toContain("Clear the unit filter");
    expect(from).not.toHaveBeenCalled();
  });

  it("formats ready kernel rows with statement-specific totals and exact evidence", () => {
    const result = buildOwnerStatement(
      input({
        cashInput: {
          depositEvents: [],
          expenseItems: [],
          incomeItems: [
            {
              amountDue: 100,
              dueDate: "2026-07-01",
              id: "rent-1",
              incomeType: "rent",
              propertyId,
            },
          ],
          monthScope: { before: "2026-08-01", from: "2026-07-01" },
          paymentAllocations: [],
          propertyIds: [propertyId],
          receiptAllocations: [
            {
              allocationId: "allocation-1",
              amount: 100,
              incomeItemId: "rent-1",
              receiptId: "receipt-1",
              receivedDate: "2026-07-20",
              reversalOfId: null,
            },
          ],
        },
      }),
    );
    const report = buildOwnerStatementTrustedReport({
      generatedAt: "2026-08-01T00:00:00.000Z",
      people: [{ displayName: "Owner One", id: "person-1" }],
      properties: [{ code: "P1", id: propertyId, name: "Property One" }],
      result,
      viewQuery: ownerStatementQuery(),
    });

    expect(report.columns.map((column) => column.label)).toContain(
      "Management fees outstanding from this period",
    );
    expect(report.title).toBe("Owner Statement readiness");
    expect(report.description).toBe(
      "Review which property and owner statements are ready before generating owner-facing documents.",
    );
    expect(report.rows[0]).toMatchObject({
      cells: {
        netMovement: "USD 100.00",
        operatingCash: "USD 100.00",
        owner: "Owner One",
        property: "P1 - Property One",
        readiness: "Ready",
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          allocationId: "allocation-1",
          classification: "operating_receipt",
          eventDate: "2026-07-20",
          incomeItemId: "rent-1",
          ownerLinkId: "owner-link-1",
          ownerPersonId: "person-1",
          propertyId,
          receiptId: "receipt-1",
          signedAmountCents: 10_000,
        }),
      ]),
      href: `/properties/${propertyId}`,
      tone: "success",
    });
    expect(report.summary.map((metric) => [metric.label, metric.value])).toEqual(
      [
        ["Ready properties", "1"],
        ["Owner statements ready", "1"],
        ["Blocked properties", "0"],
        ["Operating cash received", "USD 100.00"],
        ["Property expenses paid", "USD 0.00"],
        ["Management fees received", "USD 0.00"],
        ["Net owner cash movement", "USD 100.00"],
      ],
    );

    const csv = buildTrustedReportCsv(report);
    expect(csv).toContain("USD 100.00");
  });

  it("renders one explicit blocked property row without monetary totals", () => {
    const result = buildOwnerStatement(
      input({
        cashInput: {
          depositEvents: [],
          expenseItems: [],
          incomeItems: [],
          monthScope: { before: "2026-08-01", from: "2026-07-01" },
          paymentAllocations: [],
          propertyIds: [propertyId],
          receiptAllocations: [],
        },
        ownerLinks: [],
      }),
    );
    const report = buildOwnerStatementTrustedReport({
      generatedAt: "2026-08-01T00:00:00.000Z",
      people: [],
      properties: [{ code: "P1", id: propertyId, name: "Property One" }],
      result,
      viewQuery: ownerStatementQuery(),
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      cells: {
        netMovement: "—",
        notes: expect.stringContaining("No effective owner"),
        operatingCash: "—",
        readiness: "Blocked",
      },
      href: `/properties/${propertyId}`,
      title: expect.stringContaining("No effective owner"),
      tone: "danger",
    });
    expect(report.summary.map((metric) => metric.value)).toEqual([
      "0",
      "0",
      "1",
      "USD 0.00",
      "USD 0.00",
      "USD 0.00",
      "USD 0.00",
    ]);
    expect(buildTrustedReportCsv(report)).toContain("No effective owner");
  });

  it("keeps every Owner Statement source query organization scoped", async () => {
    const calls: QueryCall[] = [];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub(
        {
          people: {
            data: [
              {
                display_name: "Owner One",
                id: "person-1",
                primary_email: "owner@example.com",
                primary_phone: null,
              },
            ],
          },
          properties: {
            data: [{ code: "P1", id: propertyId, name: "Property One" }],
          },
          property_owners: {
            data: [
              {
                archived_at: null,
                ended_on: null,
                id: "owner-link-1",
                is_primary: true,
                ownership_percent: null,
                person_id: "person-1",
                property_id: propertyId,
                started_on: null,
              },
            ],
          },
        },
        calls,
      ),
    );

    const report = await getOwnerStatementReport({
      organizationId: "organization-1",
      viewQuery: ownerStatementQuery(),
    });

    expect(report.rows[0]?.cells.readiness).toBe("Ready");
    const queriedTables = new Set(calls.map((call) => call.table));
    for (const table of queriedTables) {
      expect(calls).toContainEqual(
        expect.objectContaining({
          args: ["organization_id", "organization-1"],
          method: "eq",
          table,
        }),
      );
    }
  });

  it("excludes allocations whose income or expense obligation was voided", async () => {
    const calls: QueryCall[] = [];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub(
        ownerStatementLoaderResults({
          depositRows: [],
          includeBlockedProperty: false,
        }),
        calls,
      ),
    );

    await getOwnerStatementReport({
      organizationId: "organization-1",
      viewQuery: ownerStatementQuery(),
    });

    expect(calls).toContainEqual({
      args: ["finance_income_items.archived_at", null],
      method: "is",
      table: "finance_receipt_allocations",
    });
    expect(calls).toContainEqual({
      args: ["finance_income_items.status", "void"],
      method: "neq",
      table: "finance_receipt_allocations",
    });
    expect(calls).toContainEqual({
      args: ["finance_expense_items.archived_at", null],
      method: "is",
      table: "finance_payment_allocations",
    });
    expect(calls).toContainEqual({
      args: ["finance_expense_items.status", "void"],
      method: "neq",
      table: "finance_payment_allocations",
    });
  });

  it("keeps valid properties ready when another property has a malformed deposit reversal", async () => {
    const blockedPropertyId = "property-2";
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub(
        ownerStatementLoaderResults({
          depositRows: [
            {
              amount: 100,
              event_date: "2026-07-22",
              event_type: "reversed",
              id: "deposit-reversal-b",
              property_id: blockedPropertyId,
              reversal_of_id: "missing-deposit-event",
            },
          ],
        }),
        [],
      ),
    );

    const report = await getOwnerStatementReport({
      organizationId: "organization-1",
      viewQuery: ownerStatementQuery(),
    });

    expect(report.rows).toHaveLength(2);
    expect(report.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cells: expect.objectContaining({
            operatingCash: "USD 100.00",
            readiness: "Ready",
          }),
        }),
        expect.objectContaining({
          cells: expect.objectContaining({
            notes: expect.stringContaining("deposit-reversal-b"),
            readiness: "Blocked",
          }),
          evidence: expect.arrayContaining([
            expect.objectContaining({
              allocatedAmountCents: null,
              classification: "security_deposit",
              depositEventId: "deposit-reversal-b",
              eventDate: "2026-07-22",
              propertyId: blockedPropertyId,
              signedAmountCents: null,
            }),
          ]),
        }),
      ]),
    );
    expect(report.summary.map((metric) => [metric.label, metric.value])).toEqual(
      [
        ["Ready properties", "1"],
        ["Owner statements ready", "1"],
        ["Blocked properties", "1"],
        ["Operating cash received", "USD 100.00"],
        ["Property expenses paid", "USD 0.00"],
        ["Management fees received", "USD 0.00"],
        ["Net owner cash movement", "USD 100.00"],
      ],
    );

    const csv = buildTrustedReportCsv(report);
    expect(csv).toContain("deposit-reversal-b");
  });

  it("blocks an unsupported deposit type with the event ID and type", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub(
        ownerStatementLoaderResults({
          depositRows: [
            {
              amount: 100,
              event_date: "2026-07-23",
              event_type: "mystery",
              id: "deposit-unsupported",
              property_id: propertyId,
              reversal_of_id: null,
            },
          ],
          includeBlockedProperty: false,
        }),
        [],
      ),
    );

    const report = await getOwnerStatementReport({
      organizationId: "organization-1",
      viewQuery: ownerStatementQuery(),
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      cells: {
        notes: expect.stringContaining(
          "Deposit event deposit-unsupported has unsupported type mystery",
        ),
        readiness: "Blocked",
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          allocatedAmountCents: null,
          depositEventId: "deposit-unsupported",
          eventDate: "2026-07-23",
          signedAmountCents: null,
        }),
      ]),
    });
  });
});

describe("Owner Statement recipient selection", () => {
  it("requires one property before creating an owner-facing document", () => {
    const selection = selectOwnerStatementRecipient(
      readyTrustedReport(),
      ownerStatementQuery(),
    );

    expect(selection).toEqual({
      message: "Select one property before generating an Owner Statement PDF.",
      status: 400,
    });
  });

  it("infers the recipient when the selected property has one ready owner", () => {
    const selection = selectOwnerStatementRecipient(readyTrustedReport(), {
      ...ownerStatementQuery(),
      propertyId,
    });

    expect(selection).toMatchObject({
      report: {
        rows: [
          {
            cells: { owner: "Owner One", property: "P1 - Property One" },
            evidence: undefined,
            ownerPersonId: "person-1",
            propertyId,
            sourceCount: 0,
            sourceLinks: [],
          },
        ],
        title: "Owner Statement",
      },
    });
  });

  it("requires an explicit recipient for a ready multi-owner property", () => {
    const report = readyTrustedReport({ twoOwners: true });

    expect(
      selectOwnerStatementRecipient(report, {
        ...ownerStatementQuery(),
        propertyId,
      }),
    ).toEqual({
      message: "Select an owner recipient before generating this statement.",
      status: 400,
    });
  });

  it("rejects a recipient that is not ready for the selected property", () => {
    expect(
      selectOwnerStatementRecipient(readyTrustedReport({ twoOwners: true }), {
        ...ownerStatementQuery(),
        ownerPersonId: "person-missing",
        propertyId,
      }),
    ).toEqual({
      message:
        "The selected owner is not a ready recipient for this property and month.",
      status: 400,
    });
  });

  it("does not infer a recipient after a malformed owner id is normalized", () => {
    expect(
      selectOwnerStatementRecipient(readyTrustedReport(), {
        ...ownerStatementQuery(),
        ownerPersonIdInvalid: true,
        propertyId,
      }),
    ).toEqual({
      message:
        "The selected owner is not a ready recipient for this property and month.",
      status: 400,
    });
  });

  it("blocks owner-facing output when the selected property is not ready", () => {
    const result = buildOwnerStatement(
      input({
        cashInput: emptyCashInput(),
        ownerLinks: [],
      }),
    );
    const report = buildOwnerStatementTrustedReport({
      generatedAt: "2026-08-01T00:00:00.000Z",
      people: [],
      properties: [{ code: "P1", id: propertyId, name: "Property One" }],
      result,
      viewQuery: ownerStatementQuery(),
    });

    expect(
      selectOwnerStatementRecipient(report, {
        ...ownerStatementQuery(),
        propertyId,
      }),
    ).toEqual({
      message:
        "This Owner Statement is not ready. Resolve the property blockers before generating it.",
      status: 409,
    });
  });

  it("selects only the requested owner and removes internal evidence", () => {
    const selection = selectOwnerStatementRecipient(
      readyTrustedReport({ twoOwners: true }),
      {
        ...ownerStatementQuery(),
        ownerPersonId: "person-2",
        propertyId,
      },
    );

    expect("report" in selection && selection.report.rows).toHaveLength(1);
    expect("report" in selection && selection.report.rows[0]).toMatchObject({
      cells: { owner: "Owner Two" },
      evidence: undefined,
      ownerPersonId: "person-2",
      sourceCount: 0,
      sourceLinks: [],
    });
    expect("report" in selection && selection.report.rows[0].cells).not.toHaveProperty(
      "notes",
    );
    expect("report" in selection && selection.report.rows[0].cells).not.toHaveProperty(
      "readiness",
    );
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
  calls: QueryCall[],
) {
  return {
    from: vi.fn((table: string) =>
      createQuery(results[table] ?? { data: [] }, table, calls),
    ),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

function createQuery(result: SupabaseResult, table: string, calls: QueryCall[]) {
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ args, method, table });
    return query;
  };
  const query = {
    eq: chain("eq"),
    gte: chain("gte"),
    in: chain("in"),
    is: chain("is"),
    lt: chain("lt"),
    neq: chain("neq"),
    order: chain("order"),
    range: (from: number, to: number) => {
      calls.push({ args: [from, to], method: "range", table });
      return Promise.resolve({
        count: result.count ?? result.data?.length ?? 0,
        data: (result.data ?? []).slice(from, to + 1),
        error: result.error ?? null,
      });
    },
    select: chain("select"),
  };
  return query;
}

function input(overrides: Partial<OwnerStatementInput>): OwnerStatementInput {
  return {
    cashInput: overrides.cashInput!,
    ownerLinks:
      overrides.ownerLinks ??
      [
        {
          archivedAt: null,
          endedOn: null,
          id: "owner-link-1",
          isPrimary: true,
          ownershipPercent: null,
          personId: "person-1",
          propertyId,
          startedOn: null,
        },
      ],
    people:
      overrides.people ??
      [
        {
          displayName: "Owner One",
          hasUsableContact: true,
          id: "person-1",
        },
      ],
  };
}

function emptyCashInput(): OwnerStatementInput["cashInput"] {
  return {
    depositEvents: [],
    expenseItems: [],
    incomeItems: [],
    monthScope: { before: "2026-08-01", from: "2026-07-01" },
    paymentAllocations: [],
    propertyIds: [propertyId],
    receiptAllocations: [],
  };
}

function readyTrustedReport({ twoOwners = false } = {}) {
  const ownerLinks: OwnerStatementInput["ownerLinks"] = [
    {
      archivedAt: null,
      endedOn: null,
      id: "owner-link-1",
      isPrimary: true,
      ownershipPercent: twoOwners ? "60.000" : null,
      personId: "person-1",
      propertyId,
      startedOn: null,
    },
  ];
  const people: OwnerStatementInput["people"] = [
    {
      displayName: "Owner One",
      hasUsableContact: true,
      id: "person-1",
    },
  ];

  if (twoOwners) {
    ownerLinks.push({
      archivedAt: null,
      endedOn: null,
      id: "owner-link-2",
      isPrimary: false,
      ownershipPercent: "40.000",
      personId: "person-2",
      propertyId,
      startedOn: null,
    });
    people.push({
      displayName: "Owner Two",
      hasUsableContact: true,
      id: "person-2",
    });
  }

  return buildOwnerStatementTrustedReport({
    generatedAt: "2026-08-01T00:00:00.000Z",
    people,
    properties: [{ code: "P1", id: propertyId, name: "Property One" }],
    result: buildOwnerStatement(
      input({ cashInput: emptyCashInput(), ownerLinks, people }),
    ),
    viewQuery: ownerStatementQuery(),
  });
}

function ownerStatementQuery(): ReportsViewQuery {
  return {
    month: "2026-07",
    ownerPersonId: "all",
    propertyId: "all",
    report: "owner-statement",
    status: "all",
    unitId: "all",
  };
}

function ownerStatementLoaderResults({
  depositRows,
  includeBlockedProperty = true,
}: {
  depositRows: unknown[];
  includeBlockedProperty?: boolean;
}): Record<string, SupabaseResult> {
  const blockedPropertyId = "property-2";
  const properties = [
    { code: "P1", id: propertyId, name: "Property One" },
    ...(includeBlockedProperty
      ? [{ code: "P2", id: blockedPropertyId, name: "Property Two" }]
      : []),
  ];
  const owners = [
    {
      archived_at: null,
      ended_on: null,
      id: "owner-link-1",
      is_primary: true,
      ownership_percent: null,
      person_id: "person-1",
      property_id: propertyId,
      started_on: null,
    },
    ...(includeBlockedProperty
      ? [
          {
            archived_at: null,
            ended_on: null,
            id: "owner-link-2",
            is_primary: true,
            ownership_percent: null,
            person_id: "person-2",
            property_id: blockedPropertyId,
            started_on: null,
          },
        ]
      : []),
  ];
  const people = [
    {
      display_name: "Owner One",
      id: "person-1",
      primary_email: "owner-one@example.com",
      primary_phone: null,
    },
    ...(includeBlockedProperty
      ? [
          {
            display_name: "Owner Two",
            id: "person-2",
            primary_email: "owner-two@example.com",
            primary_phone: null,
          },
        ]
      : []),
  ];
  return {
    finance_income_items: {
      data: [
        {
          amount_due: 100,
          due_date: "2026-07-01",
          id: "rent-ready",
          income_type: "rent",
          property_id: propertyId,
        },
      ],
    },
    finance_receipt_allocations: {
      data: [
        {
          amount: 100,
          finance_income_items: {
            amount_due: 100,
            due_date: "2026-07-01",
            id: "rent-ready",
            income_type: "rent",
            property_id: propertyId,
          },
          finance_receipts: {
            id: "receipt-ready",
            received_date: "2026-07-20",
            reversal_of_id: null,
          },
          id: "allocation-ready",
          income_item_id: "rent-ready",
        },
      ],
    },
    lease_deposit_events: { data: depositRows },
    people: { data: people },
    properties: { data: properties },
    property_owners: { data: owners },
  };
}
