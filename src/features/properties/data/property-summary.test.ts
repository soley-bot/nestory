import { describe, expect, it } from "vitest";
import {
  buildPropertySummary,
  formatPropertyStatus,
} from "@/features/properties/data/property-summary";

describe("buildPropertySummary", () => {
  it("counts occupied units and nets income by direction", () => {
    expect(
      buildPropertySummary({
        ledgerEntries: [
          { amount: 1000, currency: "USD", direction: "income" },
          { amount: 125, currency: "USD", direction: "expense" },
        ],
        property: {
          address: null,
          code: "CTR",
          id: "property-1",
          name: "Central Residence",
          owner: null,
          property_type: "Serviced Apartment",
          status: "under_renovation",
        },
        units: [{ status: "occupied" }, { status: "vacant" }],
      }),
    ).toMatchObject({
      address: "No address recorded",
      netIncome: {
        primary: "USD 875.00",
      },
      occupiedUnits: 1,
      owner: "Unassigned",
      status: "Under Renovation",
      units: 2,
    });
  });

  it("uses current leases instead of stale unit status for occupancy", () => {
    expect(
      buildPropertySummary({
        currentLeaseUnitCount: 2,
        ledgerEntries: [],
        property: {
          address: "Street 360",
          code: "CTR",
          id: "property-1",
          name: "Central Residence",
          owner: "Sokha Vannak",
          property_type: "Residential apartment",
          status: "active",
        },
        units: [
          { status: "vacant" },
          { status: "vacant" },
          { status: "vacant" },
        ],
      }),
    ).toMatchObject({
      occupiedUnits: 2,
      unitSummary: "2/3 occupied",
      units: 3,
    });
  });

  it("uses the active owner link for display and edit defaults", () => {
    expect(
      buildPropertySummary({
        activeOwner: {
          label: "Jane Owner",
          ownershipPercent: "100.000",
          personId: "person-1",
          startedOn: "2026-01-01",
        },
        ledgerEntries: [],
        property: {
          address: "123 Riverside",
          code: "RIV",
          id: "property-1",
          name: "Riverside",
          owner: "Former owner",
          property_type: "Apartment",
          status: "active",
        },
        units: [],
      }),
    ).toMatchObject({
      formValues: {
        owner: "Former owner",
        ownerPersonId: "person-1",
        ownerStartedOn: "2026-01-01",
        ownershipPercent: "100.000",
      },
      hasActiveOwnerLink: true,
      owner: "Jane Owner",
    });
  });
});

describe("formatPropertyStatus", () => {
  it("formats common stored status values", () => {
    expect(formatPropertyStatus("active")).toBe("Active");
    expect(formatPropertyStatus("under-renovation")).toBe("Under Renovation");
  });
});
