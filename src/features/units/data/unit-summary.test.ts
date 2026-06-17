import { describe, expect, it } from "vitest";
import {
  buildUnitDetail,
  buildUnitSummary,
  formatLeaseStatus,
  formatUnitStatus,
  selectCurrentLease,
} from "@/features/units/data/unit-summary";

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
        counts: {
          documents: 2,
          ledgerEntries: 3,
          timelineEvents: 4,
        },
        ledgerEntries: [],
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
            title: "AC repair",
            unit_id: unit.id,
          },
        ],
        unit,
      }),
    ).toMatchObject({
      activeLease: {
        monthlyRentLabel: "USD 850.00",
        statusLabel: "Active",
        tenantName: "Dara Tenant",
      },
      counts: {
        documents: 2,
        ledgerEntries: 3,
        timelineEvents: 4,
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
        },
      ],
      sizeLabel: "55.25 sqm",
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
          id: "newer",
          lease_start_date: "2026-04-01",
          status: "notice_given",
        },
      ])?.id,
    ).toBe("newer");
  });
});
