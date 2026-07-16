/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LedgerEntryForm } from "@/features/ledger/components/ledger-entry-form";

afterEach(cleanup);

describe("LedgerEntryForm consequences", () => {
  it("summarizes the official row and its allocation before submit", () => {
    render(
      <LedgerEntryForm
        initialValues={{
          direction: "expense",
          propertyId: "property-1",
          unitId: "unit-1",
        }}
        onClose={vi.fn()}
        properties={[{ id: "property-1", label: "HOME / Home" }]}
        units={[
          { id: "unit-1", label: "Unit 2A", propertyId: "property-1" },
        ]}
      />,
    );

    const consequence = screen.getByRole("region", {
      name: "Ledger consequence",
    });
    expect(consequence.textContent).toContain(
      "Adds one official expense ledger row",
    );
    expect(consequence.textContent).toContain("PropertyHOME / Home");
    expect(consequence.textContent).toContain("AllocationUnit 2A");
    expect(consequence.textContent).toContain("DirectionExpense");
  });
});
