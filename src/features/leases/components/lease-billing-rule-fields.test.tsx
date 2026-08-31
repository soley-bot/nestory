// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LeaseBillingRuleFields } from "@/features/leases/components/lease-billing-rule-fields";
import type { LeaseBillingRule } from "@/features/leases/lease.types";

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

describe("LeaseBillingRuleFields", () => {
  it("summarizes billing and switches between percentage and flat management fees", async () => {
    const user = userEvent.setup();
    render(
      <form data-testid="billing-form">
        <LeaseBillingRuleFields
          defaults={billingRule()}
          organizationName="Nestory Sample Operations"
          presentation="summary"
          tenantRecipient={{
            id: "tenant-a",
            label: "Dara Tenant",
            partyType: "individual",
          }}
        />
      </form>,
    );

    const summary = screen.getByRole("region", {
      name: "Billing setup summary",
    });
    expect(within(summary).getByText("Dara Tenant monthly")).not.toBeNull();
    expect(
      within(summary).getByText("Nestory Sample Operations"),
    ).not.toBeNull();
    expect(within(summary).getByText("8% while rent is active")).not.toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Management fee" }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Change billing setup" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Management fee" }));
    await user.click(screen.getByRole("option", { name: "Flat amount" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Fee amount/ }), {
      target: { value: "125.50" },
    });

    expect(
      within(summary).getByText("USD 125.50 per month while rent is active"),
    ).not.toBeNull();
    const values = new FormData(
      screen.getByTestId("billing-form") as HTMLFormElement,
    );
    expect(values.get("managementFeeMode")).toBe("flat");
    expect(values.get("managementFeeValue")).toBe("125.50");
  });

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

  it("shows concrete amount examples when agreed first or final amounts are enabled", () => {
    render(
      <LeaseBillingRuleFields
        defaults={billingRule({ finalPeriodProratedAmount: 600 })}
        tenantRecipient={{
          id: "individual-tenant",
          label: "Dara Tenant",
          partyType: "individual",
        }}
      />,
    );

    expect(
      screen
        .getByRole("textbox", { name: "First month amount (optional)" })
        .getAttribute("placeholder"),
    ).toBe("e.g. 750.00");
    expect(
      screen
        .getByRole("textbox", { name: "Final month amount (optional)" })
        .getAttribute("placeholder"),
    ).toBe("e.g. 750.00");
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
