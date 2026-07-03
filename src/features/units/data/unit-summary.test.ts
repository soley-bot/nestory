import { describe, expect, it } from "vitest";
import {
  buildUnitDetail,
  buildUnitDetailHrefs,
  buildUnitFinancialSummary,
  buildUnitSummary,
  formatLeaseStatus,
  formatUnitStatus,
  isActiveUnitLeaseStatus,
  selectCurrentLease,
} from "@/features/units/data/unit-summary";
import { chunkValues } from "@/features/units/data/units";

const property = {
  code: "CTR",
  id: "property-1",
  name: "Central Residence",
};

const unit = {
  archived_at: null,
  current_rent_amount: 850,
  current_rent_currency: "USD" as const,
  floor: "12",
  id: "unit-1",
  property_id: property.id,
  size_sqm: 55.25,
  status: "occupied",
  unit_number: "12A",
};

const lease = {
  id: "lease-1",
  lease_end_date: "2027-01-31",
  lease_start_date: "2026-02-01",
  monthly_rent_amount: 850,
  monthly_rent_currency: "USD" as const,
  primary_tenant_person_id: "person-1",
  status: "active",
  tenant_name: "Dara Tenant",
  unit_id: unit.id,
};

describe("buildUnitSummary", () => {
  it("formats rent, status, lease, timeline context, and ledger totals", () => {
    expect(
      buildUnitSummary({
        activeLease: lease,
        latestTimelineEvent: {
          event_date: "2026-06-01",
          event_type: "Inspection",
          id: "event-1",
          title: "Move-in inspection completed",
          unit_id: unit.id,
        },
        ledgerEntries: [
          {
            amount: 1000,
            currency: "USD",
            direction: "income",
            unit_id: unit.id,
          },
          {
            amount: 125,
            currency: "USD",
            direction: "expense",
            unit_id: unit.id,
          },
        ],
        property,
        unit,
      }),
    ).toMatchObject({
      formValues: {
        currentRentAmount: 850,
        currentRentCurrency: "USD",
        floor: "12",
        propertyId: property.id,
        sizeSqm: 55.25,
        status: "occupied",
        unitNumber: "12A",
      },
      floorLabel: "12",
      isArchived: false,
      ledgerNetLabel: "USD 875.00",
      leaseLabel: "Dara Tenant / Active",
      propertyCode: "CTR",
      rentLabel: "USD 850.00",
      statusLabel: "Occupied",
      statusTone: "success",
      unitNumber: "12A",
    });
  });
});

describe("buildUnitDetail", () => {
  it("keeps recent unit-level records and count context", () => {
    expect(
      buildUnitDetail({
        activeLease: lease,
        activity: [
          {
            action: "unit_updated",
            actionLabel: "Updated",
            createdAt: "2026-06-05T09:00:00.000Z",
            details: [],
            entityLabel: "Unit",
            href: "/units/unit-1",
            id: "activity-1",
            recordLabel: "12A",
            tone: "neutral",
          },
        ],
        counts: {
          documents: 2,
          ledgerEntries: 3,
          timelineEvents: 4,
        },
        documents: [
          {
            category: "Receipt",
            file_name: "ac-repair.pdf",
            id: "doc-1",
            lease_id: null,
            ledger_entry_id: "entry-1",
            mime_type: "application/pdf",
            size_bytes: 2048,
            storage_path: "org/ledger/entry-1/ac-repair.pdf",
            timeline_event_id: null,
            uploaded_at: "2026-06-04",
            url: "https://signed.example/doc-1",
          },
        ],
        ledgerEntries: [
          {
            amount: 900,
            category: "Rent",
            currency: "USD",
            direction: "income",
            id: "entry-income",
            transaction_date: "2026-06-01",
            unit_id: unit.id,
          },
          {
            amount: 75,
            category: "Maintenance",
            currency: "USD",
            direction: "expense",
            id: "entry-expense",
            transaction_date: "2026-06-03",
            unit_id: unit.id,
          },
        ],
        people: [
          {
            display_name: "Dara Tenant",
            id: "person-1",
            primary_email: "dara@example.com",
            primary_phone: null,
          },
        ],
        property,
        recentLedgerEntries: [
          {
            amount: 75,
            category: "Maintenance",
            currency: "USD",
            description: null,
            direction: "expense",
            id: "entry-1",
            transaction_date: "2026-06-03",
            unit_id: unit.id,
          },
        ],
        recentTimelineEvents: [
          {
            event_date: "2026-06-02",
            event_type: "Repair",
            id: "event-2",
            ledger_entry_id: "entry-1",
            title: "AC repair",
            unit_id: unit.id,
          },
        ],
        unit,
      }),
    ).toMatchObject({
      activeLease: {
        monthlyRentLabel: "USD 850.00",
        personId: "person-1",
        statusLabel: "Active",
        tenantName: "Dara Tenant",
      },
      activity: [
        {
          actionLabel: "Updated",
          href: "/units/unit-1",
        },
      ],
      counts: {
        documents: 2,
        ledgerEntries: 3,
        timelineEvents: 4,
      },
      documents: [
        {
          fileName: "ac-repair.pdf",
          linkedRecordHref: "/ledger?archiveState=all&entryId=entry-1",
          linkedRecordLabel: "Ledger entry",
          url: "https://signed.example/doc-1",
        },
      ],
      financialSummary: {
        expenseUsd: 75,
        incomeUsd: 900,
        maintenanceRatioLabel: "100% of expenses",
        noiUsd: 825,
        rentRevenueUsd: 900,
      },
      hrefs: {
        addDocument:
          "/documents?action=create&category=Unit&propertyId=property-1&unitId=unit-1",
        addLease:
          "/leases?action=create&propertyId=property-1&source=vacancy&unitId=unit-1",
        addLedgerEntry: "/ledger?action=create&propertyId=property-1&unitId=unit-1",
        documents:
          "/documents?archiveState=all&propertyId=property-1&unitId=unit-1",
        ledger: "/ledger?propertyId=property-1&unitId=unit-1",
        timeline: "/timeline?propertyId=property-1&unitId=unit-1",
      },
      recentLedgerEntries: [
        {
          amountLabel: "-USD 75.00",
          category: "Maintenance",
          direction: "expense",
        },
      ],
      recentTimelineEvents: [
        {
          eventType: "Repair",
          title: "AC repair",
          unitId: unit.id,
        },
      ],
      sizeLabel: "55.25 sqm",
      tenantLinks: [
        {
          contactLabel: "dara@example.com",
          href: "/people/person-1",
        },
      ],
    });
  });
});

describe("buildUnitDetail next action", () => {
  it("prioritizes adding a lease for an occupied unit without one", () => {
    expect(
      buildUnitDetail({
        counts: {
          documents: 0,
          ledgerEntries: 0,
          timelineEvents: 0,
        },
        documents: [],
        ledgerEntries: [],
        people: [],
        property,
        recentLedgerEntries: [],
        recentTimelineEvents: [],
        unit,
      }).repairAction,
    ).toMatchObject({
      href: "/leases?action=create&propertyId=property-1&source=vacancy&unitId=unit-1",
      label: "Add lease",
      tone: "danger",
    });
  });

  it("opens scoped upload when unit evidence is missing", () => {
    expect(
      buildUnitDetail({
        activeLease: lease,
        counts: {
          documents: 0,
          ledgerEntries: 0,
          timelineEvents: 0,
        },
        documents: [],
        ledgerEntries: [],
        people: [],
        property,
        recentLedgerEntries: [],
        recentTimelineEvents: [],
        unit,
      }).repairAction,
    ).toMatchObject({
      href: "/documents?action=create&category=Unit&propertyId=property-1&unitId=unit-1",
      label: "Attach evidence",
      tone: "warning",
    });
  });
});

describe("buildUnitFinancialSummary", () => {
  it("calculates trailing revenue, expenses, NOI, and repair ratio", () => {
    const summary = buildUnitFinancialSummary({
      currentDate: new Date("2026-06-28T00:00:00.000Z"),
      ledgerEntries: [
        {
          amount: 1000,
          category: "Rent",
          currency: "USD",
          direction: "income",
          transaction_date: "2026-06-01",
          unit_id: unit.id,
        },
        {
          amount: 250,
          category: "Repair",
          currency: "USD",
          direction: "expense",
          transaction_date: "2026-06-10",
          unit_id: unit.id,
        },
        {
          amount: 500,
          category: "Old repair",
          currency: "USD",
          direction: "expense",
          transaction_date: "2024-01-01",
          unit_id: unit.id,
        },
      ],
    });

    expect(summary).toMatchObject({
      expenseUsd: 250,
      incomeUsd: 1000,
      maintenanceExpenseUsd: 250,
      maintenanceRatioLabel: "100% of expenses",
      marginLabel: "75% NOI margin",
      noiUsd: 750,
      rentRevenueUsd: 1000,
    });
    expect(summary.noiDisplay.primary).toBe("USD 750.00");
  });
});

describe("buildUnitDetailHrefs", () => {
  it("builds supported linked-record and create-intent hrefs", () => {
    expect(
      buildUnitDetailHrefs({
        activeLease: lease,
        tenantLinks: [
          {
            contactLabel: "dara@example.com",
            displayName: "Dara Tenant",
            href: "/people/person-1",
            id: "person-1",
            roleLabel: "Tenant",
          },
        ],
        unit,
      }),
    ).toMatchObject({
      addDocument:
        "/documents?action=create&category=Unit&propertyId=property-1&unitId=unit-1",
      addLedgerEntry: "/ledger?action=create&propertyId=property-1&unitId=unit-1",
      addTimelineEvent: "/timeline?action=create&propertyId=property-1&unitId=unit-1",
      documents: "/documents?archiveState=all&propertyId=property-1&unitId=unit-1",
      lease: "/leases?archiveState=all&leaseId=lease-1",
      property: "/properties/property-1",
      tenantPerson: "/people/person-1",
    });
  });
});

describe("unit status helpers", () => {
  it("formats stored status values", () => {
    expect(formatUnitStatus("notice_given")).toBe("Notice Given");
    expect(formatUnitStatus("under-maintenance")).toBe("Under Maintenance");
    expect(formatLeaseStatus("active")).toBe("Active");
  });
});

describe("selectCurrentLease", () => {
  it("ignores ended leases and chooses the newest current lease", () => {
    expect(
      selectCurrentLease([
        {
          ...lease,
          id: "ended",
          lease_start_date: "2026-03-01",
          status: "ended",
        },
        {
          ...lease,
          id: "older",
          lease_start_date: "2026-01-01",
          status: "active",
        },
        {
          ...lease,
          id: "draft",
          lease_start_date: "2026-05-01",
          status: "draft",
        },
        {
          ...lease,
          id: "newer",
          lease_start_date: "2026-04-01",
          status: "notice_given",
        },
      ])?.id,
    ).toBe("newer");
  });

  it("treats only active and notice-given leases as active links", () => {
    expect(isActiveUnitLeaseStatus("active")).toBe(true);
    expect(isActiveUnitLeaseStatus("notice_given")).toBe(true);
    expect(isActiveUnitLeaseStatus("draft")).toBe(false);
    expect(selectCurrentLease([{ ...lease, status: "draft" }])).toBeUndefined();
  });
});

describe("chunkValues", () => {
  it("splits large relationship requests into stable batches", () => {
    expect(chunkValues(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
  });
});
