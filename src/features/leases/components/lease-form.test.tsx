/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PersonPartyType,
  PersonRoleValue,
} from "@/features/people/people.types";

const { createLeaseActionMock } = vi.hoisted(() => ({
  createLeaseActionMock: vi.fn(),
}));

vi.mock("@/features/leases/actions", () => ({
  createLeaseAction: createLeaseActionMock,
  updateLeaseAction: async () => ({}),
}));

vi.mock("@/features/people/components/person-form", () => ({
  PersonForm: ({
    onSuccess,
  }: {
    onSuccess?: (
      message: string,
      personId?: string,
      roles?: PersonRoleValue[],
      displayName?: string,
      partyType?: PersonPartyType,
    ) => void;
  }) => (
    <div>
      <button
        onClick={() =>
          onSuccess?.(
            "Person added.",
            "22222222-2222-4222-8222-222222222222",
            ["tenant"],
            "Acme Tenant LLC",
            "company",
          )
        }
        type="button"
      >
        Complete company tenant
      </button>
      <button
        onClick={() =>
          onSuccess?.(
            "Person added.",
            "11111111-1111-4111-8111-111111111111",
            ["tenant"],
            "Ari Tenant",
            "individual",
          )
        }
        type="button"
      >
        Complete individual tenant
      </button>
    </div>
  ),
}));

import { LeaseForm } from "@/features/leases/components/lease-form";

beforeEach(() => {
  createLeaseActionMock.mockResolvedValue({});
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

describe("LeaseForm inline tenant billing recipient", () => {
  it("returns to the step containing a server validation error", async () => {
    const user = userEvent.setup();
    createLeaseActionMock.mockResolvedValueOnce({
      fieldErrors: { tenantPersonId: ["Choose a tenant."] },
      status: "error",
    });
    render(
      <LeaseForm
        onClose={() => undefined}
        properties={[]}
        tenants={[]}
        units={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("button", { name: "Create draft lease" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tenant" })).not.toBeNull();
      expect(screen.getByText("Choose a tenant.")).not.toBeNull();
    });
  });

  it("returns a fixed-unit conflict to the editable lease dates", async () => {
    const user = userEvent.setup();
    createLeaseActionMock.mockResolvedValueOnce({
      fieldErrors: { unitId: ["This unit is already reserved for those dates."] },
      message: "Choose another unit or change the lease dates.",
      status: "error",
    });
    render(
      <LeaseForm
        createContext={{
          propertyId: "property-1",
          propertyLabel: "Riverside House",
          unitId: "unit-1",
          unitLabel: "Unit 01",
        }}
        onClose={() => undefined}
        properties={[]}
        tenants={[]}
        units={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("button", { name: "Create draft lease" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Lease terms" })).not.toBeNull();
      expect(
        screen.getByText("Choose another unit or change the lease dates."),
      ).not.toBeNull();
    });
  });

  it("guides creation through the approved steps without implying month-to-month support", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm
        createContext={{
          propertyId: "property-1",
          propertyLabel: "Riverside Shophouse",
          unitId: "unit-1",
          unitLabel: "Unit R-01",
        }}
        initialValues={{ tenantPersonId: "tenant-1" }}
        onClose={() => undefined}
        properties={[]}
        tenants={[
          {
            archived: false,
            description: "Tenant",
            id: "tenant-1",
            label: "Bright Mekong Trading",
            partyType: "company",
            roles: ["tenant"],
          },
        ]}
        units={[]}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Create lease steps" }),
    ).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Tenant" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Lease terms" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Lease terms" })).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Fixed term/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /Month-to-month/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText("Requires a future lease-contract update"),
    ).not.toBeNull();
    expect(screen.getByLabelText("Lease end date")).not.toBeNull();

    const form = screen.getByRole("form", { name: "Add lease form" });
    const payload = new FormData(form);
    expect(payload.get("propertyId")).toBe("property-1");
    expect(payload.get("unitId")).toBe("unit-1");
    expect(payload.get("tenantPersonId")).toBe("tenant-1");
    expect(payload.get("leaseType")).toBeNull();
  });

  it("hides receipt controls when the operator cannot change lease terms", () => {
    render(
      <LeaseForm
        canRecordDepositReceipt={false}
        onClose={() => undefined}
        properties={[]}
        tenants={[]}
        units={[]}
      />,
    );

    const form = screen.getByRole("form", { name: "Add lease form" });
    expect(
      screen.queryByRole("combobox", { name: "Deposit received?" }),
    ).toBeNull();
    expect(new FormData(form).get("depositReceived")).toBeNull();
  });

  it("separates the deposit obligation from an optional receipt and defaults the receipt", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm
        canRecordDepositReceipt
        onClose={() => undefined}
        properties={[]}
        tenants={[]}
        units={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    const form = screen.getByRole("form", { name: "Add lease form" });
    expect(screen.getByText("Deposit required")).not.toBeNull();
    fireEvent.change(form.elements.namedItem("depositAmount")!, {
      target: { value: "750" },
    });

    await user.click(
      screen.getByRole("combobox", { name: "Deposit received?" }),
    );
    await user.click(screen.getByRole("option", { name: "Yes, received" }));

    expect(screen.getByText("Received amount")).not.toBeNull();
    expect(screen.getByLabelText("Received on")).not.toBeNull();
    const payload = new FormData(form);
    expect(payload.get("depositReceived")).toBe("yes");
    expect(payload.get("depositReceivedAmount")).toBe("750");
    expect(payload.get("depositReceivedOn")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("shows the rent outcome while keeping technical calculation settings automatic", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm
        billingFormConfig={{
          companyOptions: [],
          operationalTimezone: "Asia/Bangkok",
          organizationName: "Nestory",
        }}
        onClose={() => undefined}
        properties={[]}
        tenants={[]}
        units={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    const form = screen.getByRole("form", { name: "Add lease form" });
    fireEvent.input(form.elements.namedItem("leaseStartDate")!, {
      target: { value: "2026-08-16" },
    });
    fireEvent.input(form.elements.namedItem("leaseEndDate")!, {
      target: { value: "2027-07-15" },
    });
    fireEvent.change(form.elements.namedItem("monthlyRentAmount")!, {
      target: { value: "1000" },
    });
    fireEvent.change(form.elements.namedItem("rentDueDay")!, {
      target: { value: "5" },
    });

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("button", { name: "Change billing setup" }),
    );

    expect(screen.queryByText("Advanced billing rules")).toBeNull();
    expect(screen.queryByText("Calculation timezone")).toBeNull();
    expect(
      screen.getByRole("combobox", {
        name: "First or final month amount",
      }).textContent,
    ).toContain("Calculate automatically");
    expect(
      screen.queryByRole("textbox", { name: "First month amount (optional)" }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Final month amount (optional)" }),
    ).toBeNull();

    const summary = screen.getByRole("region", {
      name: "Rent preview",
    });
    expect(within(summary).getByText("USD 516.13")).not.toBeNull();
    expect(within(summary).getByText("USD 1,000.00")).not.toBeNull();
    expect(within(summary).getByText("USD 483.87")).not.toBeNull();
    expect(within(summary).getByText("Day 5")).not.toBeNull();

    const payload = new FormData(form);
    expect(payload.get("rentCalculationTimezone")).toBe("Asia/Bangkok");
    expect(payload.get("fullManagementFeeDuringProration")).toBe("no");
  });

  it.each([
    [
      "Complete company tenant",
      "22222222-2222-4222-8222-222222222222",
      "company",
    ],
    [
      "Complete individual tenant",
      "11111111-1111-4111-8111-111111111111",
      "individual",
    ],
  ] as const)(
    "preserves edited billing values and the party type from %s",
    async (completionLabel, personId, partyType) => {
      const user = userEvent.setup();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const consoleWarn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      render(
        <LeaseForm
          billingFormConfig={{
            companyOptions: [],
            operationalTimezone: "Asia/Bangkok",
            organizationName: "Nestory",
          }}
          onClose={() => undefined}
          properties={[]}
          tenants={[]}
          units={[]}
        />,
      );

      const form = screen.getByRole("form", { name: "Add lease form" });
      const chooseOption = async (label: RegExp | string, option: string) => {
        await user.click(screen.getByRole("combobox", { name: label }));
        await user.click(await screen.findByRole("option", { name: option }));
      };

      await user.click(screen.getByRole("button", { name: "Next" }));
      await user.click(screen.getByRole("button", { name: "Next" }));
      await user.click(screen.getByRole("button", { name: "Next" }));
      await user.click(
        screen.getByRole("button", { name: "Change billing setup" }),
      );

      await chooseOption("Who collects rent?", "Collected by owner");
      await chooseOption("Management fee", "Flat amount");
      fireEvent.change(form.elements.namedItem("managementFeeValue")!, {
        target: { value: "125.50" },
      });
      await chooseOption(/^Charge management fee\?/, "No");
      await chooseOption("First or final month amount", "Use agreed amounts");
      fireEvent.change(form.elements.namedItem("firstPeriodProratedAmount")!, {
        target: { value: "321.45" },
      });
      fireEvent.change(form.elements.namedItem("finalPeriodProratedAmount")!, {
        target: { value: "654.32" },
      });

      await user.click(screen.getByRole("button", { name: "1 Tenant" }));
      await user.click(screen.getByRole("button", { name: "New tenant" }));
      await user.click(screen.getByRole("button", { name: completionLabel }));

      const payload = new FormData(form);
      expect(payload.get("tenantPersonId")).toBe(personId);
      expect(payload.get("billingRecipientKind")).toBe(partyType);
      expect(payload.get("billingRecipientPersonId")).toBe(personId);
      expect(payload.get("collectionRoute")).toBe("direct_to_owner");
      expect(payload.get("managementFeeMode")).toBe("flat");
      expect(payload.get("managementFeeValue")).toBe("125.50");
      expect(payload.get("chargeManagementFeeWhenActive")).toBe("no");
      expect(payload.get("fullManagementFeeDuringProration")).toBe("no");
      expect(payload.get("chargeThroughLeaseEnd")).toBe("yes");
      expect(payload.get("rentCalculationTimezone")).toBe("Asia/Bangkok");
      expect(payload.get("firstPeriodProratedAmount")).toBe("321.45");
      expect(payload.get("finalPeriodProratedAmount")).toBe("654.32");
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    },
    15_000,
  );
});
