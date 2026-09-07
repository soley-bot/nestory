import { beforeEach, describe, expect, it, vi } from "vitest";

import { getReportsScreenData } from "@/features/reports/data/reports";
import type { ReportsViewQuery } from "@/features/reports/reports.types";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("live Finance report reads", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
  });

  it("populates selectors and owner activity from the scoped Finance context", async () => {
    // Break caught: falling back to base properties/people RLS makes a Finance
    // reader see an empty report even though its scoped context and activity exist.
    const harness = createReportReadHarness({
      context: financeContext({
        owner_assignments: [
          ownerAssignment({ ended_on: "2026-07-31", person_id: OWNER_ID }),
          ownerAssignment({
            id: "30000000-0000-4000-8000-000000000002",
            person_id: FUTURE_OWNER_ID,
            started_on: "2026-08-01",
          }),
        ],
        people: [
          person(OWNER_ID, "Historical Owner"),
          person(FUTURE_OWNER_ID, "Future Owner"),
        ],
      }),
      propertyAccountEntries: [
        {
          amount: "850.00",
          balance_effect: "850.00",
          category: "rent_income",
          event_date: "2026-07-15",
          label: "July rent",
          property_id: PROPERTY_ID,
          source_id: "40000000-0000-4000-8000-000000000001",
          source_type: "tenant_invoice_payment",
        },
      ],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);

    const result = await getReportsScreenData(
      ORGANIZATION_ID,
      reportQuery({ month: "2026-07" }),
    );

    expect(result.propertyOptions).toEqual([
      { id: PROPERTY_ID, label: "Riverside Apartments — RIV" },
    ]);
    expect(result.unitOptions).toEqual([
      {
        id: UNIT_ID,
        label: "RIV / Unit A1",
        propertyId: PROPERTY_ID,
      },
    ]);
    expect(result.ownerOptions).toEqual([
      { id: OWNER_ID, label: "Historical Owner" },
    ]);
    expect(result.trustedReport.rows).toEqual([
      expect.objectContaining({
        cells: expect.objectContaining({
          owner: "Historical Owner",
          property: "Riverside Apartments — RIV",
          rent: "USD 850.00",
        }),
        propertyId: PROPERTY_ID,
      }),
    ]);
  });

  it("keeps property-level Unit P&L activity when the property has no active units", async () => {
    // Break caught: deriving report scope from directly readable units (or
    // requiring at least one unit) drops valid property-level recognition.
    const harness = createReportReadHarness({
      context: financeContext({ units: [] }),
      ownerProfitLossEvents: [ownerProfitLossEvent()],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);

    const result = await getReportsScreenData(
      ORGANIZATION_ID,
      reportQuery({ report: "unit-profit-loss" }),
    );

    expect(result.propertyOptions).toEqual([
      { id: PROPERTY_ID, label: "Riverside Apartments — RIV" },
    ]);
    expect(result.unitOptions).toEqual([]);
    expect(result.trustedReport.rows).toEqual([
      expect.objectContaining({
        cells: expect.objectContaining({
          income: "USD 300.00",
          property: "RIV - Riverside Apartments",
          unit: "Property-level",
        }),
        id: `property-level:${PROPERTY_ID}`,
      }),
    ]);
  });

  it("preserves the report property selector's name ordering", async () => {
    // Break caught: the scoped context is code-ordered, while the released
    // report selector is intentionally name-ordered.
    const harness = createReportReadHarness({
      context: financeContext({
        properties: [
          {
            archived_at: null,
            code: "AAA",
            id: "10000000-0000-4000-8000-000000000002",
            name: "Zebra House",
          },
          {
            archived_at: null,
            code: "RIV",
            id: PROPERTY_ID,
            name: "Riverside Apartments",
          },
        ],
        units: [],
      }),
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);

    const result = await getReportsScreenData(
      ORGANIZATION_ID,
      reportQuery({ report: "unit-profit-loss" }),
    );

    expect(result.propertyOptions.map(({ label }) => label)).toEqual([
      "Riverside Apartments — RIV",
      "Zebra House — AAA",
    ]);
  });

  it.each([
    {
      label: "denied",
      response: { data: null, error: { message: "Not authorized" } },
    },
    {
      label: "malformed",
      response: { data: { properties: [] }, error: null },
    },
  ])("fails closed when the scoped Finance context is $label", async ({ response }) => {
    // Break caught: converting an authorization or contract failure into an
    // authoritative-looking empty financial report.
    const harness = createReportReadHarness({ contextResponse: response });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);

    await expect(
      getReportsScreenData(ORGANIZATION_ID, reportQuery()),
    ).rejects.toThrow(/finance read context/i);
  });
});

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const PROPERTY_ID = "10000000-0000-4000-8000-000000000001";
const UNIT_ID = "20000000-0000-4000-8000-000000000001";
const OWNER_ID = "30000000-0000-4000-8000-000000000001";
const FUTURE_OWNER_ID = "30000000-0000-4000-8000-000000000003";

function reportQuery(
  overrides: Partial<ReportsViewQuery> = {},
): ReportsViewQuery {
  return {
    month: "2026-07",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "monthly-owner-activity",
    status: "all",
    unitId: "all",
    ...overrides,
  };
}

function financeContext(overrides: Record<string, unknown> = {}) {
  return {
    billing_terms: [],
    leases: [],
    owner_assignments: [],
    people: [],
    properties: [
      {
        archived_at: null,
        code: "RIV",
        id: PROPERTY_ID,
        name: "Riverside Apartments",
      },
    ],
    terms: [],
    units: [
      {
        archived_at: null,
        id: UNIT_ID,
        property_id: PROPERTY_ID,
        unit_number: "A1",
      },
    ],
    ...overrides,
  };
}

function ownerAssignment(overrides: Record<string, unknown> = {}) {
  return {
    archived_at: null,
    ended_on: null,
    id: "30000000-0000-4000-8000-000000000001",
    is_primary: true,
    person_id: OWNER_ID,
    property_id: PROPERTY_ID,
    started_on: "2026-01-01",
    ...overrides,
  };
}

function person(id: string, displayName: string) {
  return {
    archived_at: null,
    display_name: displayName,
    id,
    party_type: "individual",
  };
}

function ownerProfitLossEvent() {
  const sourceId = "50000000-0000-4000-8000-000000000001";
  return {
    category_code: "rent",
    category_id: null,
    category_label: "Rent",
    category_reporting_group: "rent",
    contract_version: "owner_profit_loss_events.v2",
    currency: "USD",
    cursor_recognized_on: "2026-07-15",
    cursor_source_id: sourceId,
    cursor_source_type: "tenant_invoice_line",
    description: "July rent",
    economic_class: "owner_income",
    event_key: `tenant_invoice_line:${sourceId}`,
    is_reversal: false,
    lease_id: null,
    organization_id: ORGANIZATION_ID,
    period_start: "2026-07-01",
    property_id: PROPERTY_ID,
    recognition_basis: "tenant_invoice_issued",
    recognized_on: "2026-07-15",
    reversal_of_id: null,
    reversal_source_type: null,
    signed_amount: "300.00",
    source_id: sourceId,
    source_parent_id: null,
    source_parent_type: null,
    source_type: "tenant_invoice_line",
    unit_id: null,
  };
}

type QueryResult = { data: unknown; error: { message: string } | null };

function createReportReadHarness({
  context = financeContext(),
  contextResponse,
  ownerProfitLossEvents = [],
  propertyAccountEntries = [],
}: {
  context?: unknown;
  contextResponse?: QueryResult;
  ownerProfitLossEvents?: unknown[];
  propertyAccountEntries?: unknown[];
} = {}) {
  class Query implements PromiseLike<QueryResult> {
    constructor(private readonly result: QueryResult) {}

    eq() { return this; }
    gte() { return this; }
    in() { return this; }
    is() { return this; }
    lte() { return this; }
    or() { return this; }
    order() { return this; }
    range() { return this; }
    select() { return this; }

    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(this.result).then(onfulfilled, onrejected);
    }
  }

  return {
    client: {
      from: (table: string) =>
        new Query({
          data:
            table === "property_account_entries"
              ? propertyAccountEntries
              : [],
          error: null,
        }),
      rpc: (name: string) => {
        if (name === "get_finance_read_context") {
          return Promise.resolve(
            contextResponse ?? { data: context, error: null },
          );
        }
        if (name === "get_owner_profit_loss_events_page") {
          return Promise.resolve({ data: ownerProfitLossEvents, error: null });
        }
        throw new Error(`Unexpected report RPC: ${name}`);
      },
    },
  };
}
