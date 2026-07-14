import { describe, expect, it, vi } from "vitest";

import {
  buildOwnerStatement,
  type OwnerStatementInput,
} from "@/features/reports/data/owner-statement";
import { buildTrustedReportCsv } from "@/features/reports/data/csv";
import {
  buildOwnerStatementTrustedReport,
  getOwnerStatementReport,
} from "@/features/reports/data/owner-statement-report";
import { buildTrustedReportPdf } from "@/features/reports/data/pdf";
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
        ["Ready statements", "1"],
        ["Blocked properties", "0"],
        ["Operating cash received", "USD 100.00"],
        ["Property expenses paid", "USD 0.00"],
        ["Management fees received", "USD 0.00"],
        ["Net owner cash movement", "USD 100.00"],
      ],
    );

    const csv = buildTrustedReportCsv(report);
    const pdf = Buffer.from(
      buildTrustedReportPdf({ organizationName: "Demo Org", report }),
    ).toString("latin1");
    expect(csv).toContain("USD 100.00");
    expect(pdf).toContain("USD 100.00");
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

function ownerStatementQuery(): ReportsViewQuery {
  return {
    month: "2026-07",
    propertyId: "all",
    report: "owner-statement",
    status: "all",
    unitId: "all",
  };
}
