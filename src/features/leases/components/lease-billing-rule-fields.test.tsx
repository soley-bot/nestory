// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LeaseBillingRuleFields } from "@/features/leases/components/lease-billing-rule-fields";

afterEach(cleanup);

describe("LeaseBillingRuleFields", () => {
  it("defaults a company tenant to a matching company billing recipient", () => {
    render(
      <form data-testid="billing-form">
        <LeaseBillingRuleFields
          tenantRecipient={{
            id: "company-tenant",
            label: "Acme Tenant Co",
            partyType: "company",
          }}
        />
      </form>,
    );

    const values = new FormData(
      screen.getByTestId("billing-form") as HTMLFormElement,
    );
    expect(values.get("billingRecipientKind")).toBe("company");
    expect(values.get("billingRecipientPersonId")).toBe("company-tenant");
    expect(
      screen.getByRole("combobox", { name: "Bill to" }).textContent,
    ).toContain("Company");
    expect(
      screen.getByRole("combobox", { name: "Recipient" }).textContent,
    ).toContain("Acme Tenant Co");
  });

  it("keeps invoice-time management fee charging visible and enabled by default", () => {
    render(
      <LeaseBillingRuleFields
        tenantRecipient={{
          id: "individual-tenant",
          label: "Dara Tenant",
          partyType: "individual",
        }}
      />,
    );

    const control = screen.getByRole("combobox", {
      name: /^Charge management fee\?/,
    });
    expect(control.textContent).toContain("Yes");
    expect(control.closest("details")).toBeNull();
  });
});
