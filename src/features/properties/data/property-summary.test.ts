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
        secondary: "KHR 3,587,500",
      },
      occupiedUnits: 1,
      owner: "Unassigned",
      status: "Under Renovation",
      units: 2,
    });
  });

  it("uses the active owner link for display and edit defaults", () => {
    expect(
      buildPropertySummary({
        activeOwner: {
          label: "Jane Owner",
          personId: "person-1",
        },
        ledgerEntries: [],
        property: {
          address: "123 Riverside",
          code: "RIV",
          id: "property-1",
          name: "Riverside",
          owner: "Legacy owner",
          property_type: "Apartment",
          status: "active",
        },
        units: [],
      }),
    ).toMatchObject({
      formValues: {
        owner: "Legacy owner",
        ownerPersonId: "person-1",
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
