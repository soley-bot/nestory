import { describe, expect, it } from "vitest";
import {
  buildTrustedReport,
  getTrustedReportSourceRequirements,
} from "@/features/reports/data/trusted-report";

type TrustedReportInput = Parameters<typeof buildTrustedReport>[0];

type TrustedReportInputOverrides = Partial<Omit<TrustedReportInput, "viewQuery">> & {
  viewQuery?: Partial<TrustedReportInput["viewQuery"]>;
};

function makeReportInput(
  overrides: TrustedReportInputOverrides = {},
): TrustedReportInput {
  const base: TrustedReportInput = {
    documents: [
      {
        file_name: "receipt, June.pdf",
        id: "doc-1",
        lease_id: null,
        ledger_entry_id: "ledger-expense",
        property_id: null,
        timeline_event_id: "timeline-1",
        unit_id: "unit-1",
      },
    ],
    generatedAt: "2026-06-15T00:00:00.000Z",
    ledgerEntries: [
      {
        amount: 500,
        category: "rent",
        currency: "USD",
        description: "June rent",
        direction: "income",
        id: "ledger-income",
        property_id: "property-1",
        transaction_date: "2026-06-05",
        unit_id: "unit-1",
      },
      {
        amount: 120,
        category: "maintenance",
        currency: "USD",
        description: "AC repair",
        direction: "expense",
        id: "ledger-expense",
        property_id: "property-1",
        transaction_date: "2026-06-10",
        unit_id: "unit-1",
      },
    ],
    maintenanceTasks: [
      {
        actual_cost_amount: 90,
        actual_cost_currency: "USD",
        category: "AC",
        cost_estimate_amount: 150,
        cost_estimate_currency: "USD",
        created_at: "2026-06-09T00:00:00.000Z",
        due_date: "2026-06-10",
        due_time: "15:00",
        id: "task-1",
        ledger_entry_id: "ledger-expense",
        priority: "high",
        property_id: "property-1",
        recurrence_frequency: "none",
        status: "in_progress",
        timeline_event_id: "timeline-1",
        title: "AC repair",
        unit_id: "unit-1",
      },
    ],
    leases: [
      {
        id: "lease-1",
        lease_end_date: "2026-12-31",
        lease_start_date: "2026-01-01",
        monthly_rent_amount: 500,
        monthly_rent_currency: "USD",
        primary_tenant_person_id: "person-tenant",
        property_id: "property-1",
        status: "active",
        tenant_name: "Tenant One",
        unit_id: "unit-1",
      },
    ],
    owners: [
      {
        id: "owner-1",
        ownership_label: "Primary",
        ownership_percent: 100,
        person_id: "person-owner",
        property_id: "property-1",
      },
    ],
    people: [
      {
        display_name: "Owner One",
        id: "person-owner",
      },
    ],
    periodEnd: "2026-06-30",
    periodStart: "2026-06-01",
    properties: [
      {
        code: "P1",
        id: "property-1",
        name: "Property One",
        owner: null,
        property_type: "Apartment",
        status: "active",
      },
    ],
    timelineEvents: [
      {
        cost_amount: 80,
        cost_currency: "USD",
        description: "Fixed AC",
        event_date: "2026-06-10",
        event_type: "Repair",
        id: "timeline-1",
        lease_id: null,
        ledger_entry_id: "ledger-expense",
        property_id: "property-1",
        title: "AC repair",
        unit_id: "unit-1",
      },
    ],
    units: [
      {
        current_rent_amount: null,
        current_rent_currency: null,
        floor: "1",
        id: "unit-1",
        property_id: "property-1",
        size_sqm: 50,
        status: "occupied",
        unit_number: "A1",
      },
      {
        current_rent_amount: null,
        current_rent_currency: null,
        floor: "1",
        id: "unit-2",
        property_id: "property-1",
        size_sqm: 45,
        status: "vacant",
        unit_number: "A2",
      },
    ],
    viewQuery: {
      month: "2026-06",
      propertyId: "all",
      report: "unit-performance",
      status: "all",
      unitId: "all",
    },
  };

  return {
    ...base,
    ...overrides,
    viewQuery: {
      ...base.viewQuery,
      ...overrides.viewQuery,
    },
  };
}

function metricValue(report: ReturnType<typeof buildTrustedReport>, label: string) {
  return report.summary.find((metric) => metric.label === label);
}

function enabledSourceKeys(
  requirements: ReturnType<typeof getTrustedReportSourceRequirements>,
) {
  return Object.entries(requirements)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .toSorted();
}

describe("trusted reports", () => {
  it("declares focused source requirements for each report kind", () => {
    const expectations = [
      {
        report: "income-expense",
        sources: ["ledgerEntries", "units"],
      },
      {
        report: "lease-expiry",
        sources: ["leases", "units"],
      },
      {
        report: "maintenance-cost",
        sources: ["ledgerEntries", "maintenanceTasks", "timelineEvents", "units"],
      },
      {
        report: "missing-data",
        sources: ["documents", "leases", "owners", "units"],
      },
      {
        report: "owner-statement",
        sources: ["ledgerEntries", "owners", "people"],
      },
      {
        report: "property-performance",
        sources: ["ledgerEntries", "leases", "timelineEvents", "units"],
      },
      {
        report: "rent-roll",
        sources: ["documents", "leases", "units"],
      },
      {
        report: "unit-performance",
        sources: ["documents", "ledgerEntries", "timelineEvents", "units"],
      },
      {
        report: "vacancy-risk",
        sources: ["documents", "leases", "units"],
      },
    ] as const;

    for (const { report, sources } of expectations) {
      expect(enabledSourceKeys(getTrustedReportSourceRequirements(report))).toEqual(
        sources.toSorted(),
      );
    }
  });

  it("calculates unit performance from ledger and timeline source rows", () => {
    const report = buildTrustedReport(makeReportInput());
    const unitRow = report.rows.find((row) => row.id === "unit-1");

    expect(unitRow?.cells).toMatchObject({
      documents: "1",
      expenses: "USD 120.00",
      income: "USD 500.00",
      maintenance: "USD 200.00",
      noi: "USD 380.00",
    });
    expect(unitRow?.sourceLinks.map((source) => source.recordType)).toEqual(
      expect.arrayContaining([
        "property",
        "unit",
        "ledger",
        "timeline",
        "document",
      ]),
    );
    expect(
      unitRow?.sourceLinks.find((source) => source.recordType === "document"),
    ).toMatchObject({
      href: "/documents?archiveState=all&documentId=doc-1",
    });
    expect(metricValue(report, "Income")).toMatchObject({
      sourceCount: 1,
      value: "USD 500.00",
    });
    expect(metricValue(report, "Expenses")).toMatchObject({
      sourceCount: 1,
      value: "USD 120.00",
    });
    expect(metricValue(report, "NOI")).toMatchObject({
      sourceCount: 2,
      value: "USD 380.00",
    });
  });

  it("filters rent roll rows by unit status", () => {
    const report = buildTrustedReport(
      makeReportInput({
        viewQuery: {
          report: "rent-roll",
          status: "vacant",
        },
      }),
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      href: "/units/unit-2",
      id: "unit-2",
      title: "P1 / Unit A2",
    });
    expect(report.rows[0]?.cells).toMatchObject({
      rent: "No rent",
      status: "Vacant",
    });
  });

  it("limits report rows and scope labels to a deep-linked unit", () => {
    const report = buildTrustedReport(
      makeReportInput({
        viewQuery: {
          report: "unit-performance",
          unitId: "unit-1",
        },
      }),
    );

    expect(report.scopeLabel).toBe("P1 - Property One / Unit A1 / Floor 1");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.id).toBe("unit-1");
    expect(report.rows[0]?.cells).toMatchObject({
      income: "USD 500.00",
      noi: "USD 380.00",
    });
  });

  it("does not count lease-backed rent as missing property risk", () => {
    const report = buildTrustedReport(
      makeReportInput({
        viewQuery: {
          report: "property-performance",
        },
      }),
    );

    expect(report.rows[0]?.cells).toMatchObject({
      occupancy: "1/2",
      risk: "1",
    });
  });

  it("opens scoped upload for missing unit evidence rows", () => {
    const report = buildTrustedReport(
      makeReportInput({
        viewQuery: {
          report: "missing-data",
        },
      }),
    );

    expect(report.rows.find((row) => row.id === "unit-docs-unit-2")).toMatchObject({
      href: "/documents?action=create&category=Unit&propertyId=property-1&unitId=unit-2",
    });
  });

  it("opens scoped lease creation for occupied units without active leases", () => {
    const report = buildTrustedReport(
      makeReportInput({
        leases: [],
        viewQuery: {
          report: "missing-data",
        },
      }),
    );

    expect(report.rows.find((row) => row.id === "unit-lease-unit-1")).toMatchObject({
      href: "/leases?action=create&propertyId=property-1&unitId=unit-1",
    });
  });

  it("builds maintenance cost report from cases without double-counting linked rows", () => {
    const report = buildTrustedReport(
      makeReportInput({
        viewQuery: {
          report: "maintenance-cost",
        },
      }),
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.cells).toMatchObject({
      amount: "USD 90.00 / Est. USD 150.00",
      category: "Ac",
      source: "Case",
      status: "In Progress",
    });
    expect(report.rows[0]?.sourceLinks.map((source) => source.recordType)).toEqual(
      expect.arrayContaining(["maintenance", "ledger", "timeline"]),
    );
    expect(metricValue(report, "Cases")).toMatchObject({
      sourceCount: 1,
      value: "1",
    });
    expect(metricValue(report, "Actual cost")).toMatchObject({
      value: "USD 90.00",
    });
    expect(metricValue(report, "Estimated")).toMatchObject({
      value: "USD 150.00",
    });
  });
});
