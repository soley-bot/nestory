import { describe, expect, it } from "vitest";
import { buildPropertyDetail } from "@/features/properties/data/property-detail";

const property = {
  address: "District 1",
  code: "NST-001",
  id: "property-1",
  name: "Nestory Residence",
  owner: "Owner Group A",
  property_type: "Serviced Apartment",
  status: "active",
};

describe("buildPropertyDetail", () => {
  it("keeps a property useful when no unit children exist", () => {
    const detail = buildPropertyDetail({
      ledgerEntries: [],
      property,
      units: [],
    });

    expect(detail.unitSummary).toBe("Property-only");
    expect(detail.activeUnitCount).toBe(0);
    expect(detail.archivedUnitCount).toBe(0);
    expect(detail.totalUnitCount).toBe(0);
    expect(detail.unitsList).toEqual([]);
  });

  it("formats optional units with rent, status, and archive state", () => {
    const detail = buildPropertyDetail({
      ledgerEntries: [
        { amount: 1200, currency: "USD", direction: "income" },
        { amount: 200, currency: "USD", direction: "expense" },
      ],
      property,
      units: [
        {
          archived_at: null,
          current_rent_amount: 450,
          current_rent_currency: "USD",
          floor: "3",
          id: "unit-1",
          status: "occupied",
          unit_number: "03-01",
        },
        {
          archived_at: "2026-06-16T00:00:00.000Z",
          current_rent_amount: null,
          current_rent_currency: null,
          floor: null,
          id: "unit-2",
          status: "vacant",
          unit_number: "03-02",
        },
      ],
    });

    expect(detail.unitSummary).toBe("1/1 occupied, 1 archived");
    expect(detail.netIncome).toMatchObject({
      primary: "USD 1,000.00",
      secondary: "KHR 4,100,000",
    });
    expect(detail.unitsList).toEqual([
      expect.objectContaining({
        currentRent: "USD 450.00",
        currentRentDisplay: expect.objectContaining({
          primary: "USD 450.00",
          secondary: "KHR 1,845,000",
        }),
        floor: "3",
        isArchived: false,
        status: "Occupied",
        unitNumber: "03-01",
      }),
      expect.objectContaining({
        currentRent: "No rent set",
        floor: "Not set",
        isArchived: true,
        status: "Vacant",
        unitNumber: "03-02",
      }),
    ]);
  });
});
