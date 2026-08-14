/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyInspector } from "@/features/properties/components/property-inspector";
import { buildPropertySummary } from "@/features/properties/data/property-summary";
import { UnitInspector } from "@/features/units/components/unit-inspector";
import { buildUnitSummary } from "@/features/units/data/unit-summary";

afterEach(cleanup);

describe("quick-view supporting copy", () => {
  it("keeps real Property metadata and removes generic destination narration", () => {
    const property = buildPropertySummary({
      activeOwner: { label: "Nora Owner", personId: "owner-1" },
      hasActiveOwnerLink: true,
      ledgerEntries: [{ amount: 1200, currency: "USD", direction: "income" }],
      property: {
        address: "1 Main Street",
        code: "HOME",
        id: "property-1",
        name: "Home Residence",
        owner: "Nora Owner",
        property_type: "Apartment",
        status: "active",
      },
      units: [{ status: "occupied" }, { status: "vacant" }],
    });

    render(
      <PropertyInspector
        onArchiveProperty={vi.fn()}
        onEditProperty={vi.fn()}
        onRestoreProperty={vi.fn()}
        property={property}
      />,
    );

    const related = screen.getByRole("navigation", {
      name: "Property records",
    });

    expect(
      within(related).getByRole("link", { name: "Units 2" }).getAttribute("href"),
    ).toBe("/units?propertyId=property-1");
    expect(
      within(related).getByRole("link", { name: "Leases 1" }).getAttribute("href"),
    ).toBe("/leases?propertyId=property-1");
    expect(within(related).getByRole("link", { name: "Ledger" })).toBeTruthy();
    expect(within(related).getByRole("link", { name: "Timeline" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Related records" })).toBeNull();
    expect(within(related).queryByText("Review occupancy")).toBeNull();
    expect(within(related).queryByText("View financial activity")).toBeNull();
    expect(within(related).queryByText("Recent history")).toBeNull();
  });

  it("renders Unit record destinations without explanatory filler", () => {
    const unit = buildUnitSummary({
      ledgerEntries: [
        { amount: 900, currency: "USD", direction: "income", unit_id: "unit-1" },
      ],
      property: {
        code: "HOME",
        id: "property-1",
        name: "Home Residence",
      },
      unit: {
        archived_at: null,
        current_rent_amount: 900,
        current_rent_currency: "USD",
        floor: "1",
        id: "unit-1",
        property_id: "property-1",
        size_sqm: 48,
        status: "vacant",
        unit_number: "1A",
      },
    });

    render(
      <UnitInspector
        onArchiveUnit={vi.fn()}
        onEditUnit={vi.fn()}
        onRestoreUnit={vi.fn()}
        unit={unit}
      />,
    );

    const related = screen
      .getByRole("heading", { name: "Related records" })
      .closest("section");

    expect(related).not.toBeNull();
    expect(
      within(related!).getByRole("link", { name: "Timeline" }).getAttribute("href"),
    ).toBe("/timeline?unitId=unit-1");
    expect(
      within(related!).getByRole("link", { name: "Ledger" }).getAttribute("href"),
    ).toBe("/ledger?propertyId=property-1&query=1A");
    expect(within(related!).queryByText("Recent history")).toBeNull();
    expect(within(related!).queryByText("Financial activity")).toBeNull();
  });
});
