// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LeaseBillingRuleFields } from "@/features/leases/components/lease-billing-rule-fields";
import type { LeaseBillingRule } from "@/features/leases/lease.types";

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

  it("fixes rent charging through lease end as an explicit submitted snapshot", () => {
    render(
      <form data-testid="billing-form">
        <LeaseBillingRuleFields
          tenantRecipient={{
            id: "individual-tenant",
            label: "Dara Tenant",
            partyType: "individual",
          }}
        />
      </form>,
    );

    expect(
      screen.queryByRole("combobox", { name: /^Charge through lease end\?/ }),
    ).toBeNull();
    const values = new FormData(
      screen.getByTestId("billing-form") as HTMLFormElement,
    );
    expect(values.get("chargeThroughLeaseEnd")).toBe("yes");
  });

  it("moves a tenant-derived recipient when the selected tenant changes", () => {
    const { rerender } = render(
      <form data-testid="billing-form">
        <LeaseBillingRuleFields
          tenantRecipient={{
            id: "tenant-a",
            label: "Tenant A",
            partyType: "individual",
          }}
        />
      </form>,
    );

    rerender(
      <form data-testid="billing-form">
        <LeaseBillingRuleFields
          tenantRecipient={{
            id: "tenant-b",
            label: "Tenant B",
            partyType: "individual",
          }}
        />
      </form>,
    );

    const values = new FormData(
      screen.getByTestId("billing-form") as HTMLFormElement,
    );
    expect(values.get("billingRecipientKind")).toBe("individual");
    expect(values.get("billingRecipientPersonId")).toBe("tenant-b");
  });

  it("preserves an explicit alternate recipient when the tenant changes", () => {
    const defaults = billingRule({
      billingRecipientKind: "company",
      billingRecipientLabel: "Billing Company",
      billingRecipientPersonId: "billing-company",
    });
    const props = {
      companyOptions: [{ id: "billing-company", label: "Billing Company" }],
      defaults,
    };
    const { rerender } = render(
      <form data-testid="billing-form">
        <LeaseBillingRuleFields
          {...props}
          tenantRecipient={{
            id: "tenant-a",
            label: "Tenant A",
            partyType: "individual",
          }}
        />
      </form>,
    );

    rerender(
      <form data-testid="billing-form">
        <LeaseBillingRuleFields
          {...props}
          tenantRecipient={{
            id: "tenant-b",
            label: "Tenant B",
            partyType: "individual",
          }}
        />
      </form>,
    );

    const values = new FormData(
      screen.getByTestId("billing-form") as HTMLFormElement,
    );
    expect(values.get("billingRecipientKind")).toBe("company");
    expect(values.get("billingRecipientPersonId")).toBe("billing-company");
  });
});

function billingRule(
  overrides: Partial<LeaseBillingRule> = {},
): LeaseBillingRule {
  return {
    billingRecipientKind: "individual",
    billingRecipientLabel: "Tenant A",
    billingRecipientPersonId: "tenant-a",
    chargeManagementFeeWhenActive: true,
    chargeThroughLeaseEnd: true,
    collectionRoute: "through_ips",
    effectiveFrom: "2026-08-01",
    effectiveTo: "2027-07-31",
    finalPeriodProratedAmount: null,
    firstPeriodProratedAmount: null,
    fullManagementFeeDuringProration: false,
    id: "billing-current",
    leaseEndProrationRule: "actual_days",
    leaseStartProrationRule: "actual_days",
    managementFeeMode: "percentage",
    managementFeeValue: 8,
    midPeriodRentChangeRule: "next_full_month",
    rentCalculationTimezone: "Asia/Bangkok",
    shortMonthDueDayRule: "last_calendar_day",
    state: "current",
    ...overrides,
  };
}
