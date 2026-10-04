/* @vitest-environment jsdom */

import {
  act,
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

type TestUser = ReturnType<typeof userEvent.setup>;

async function advanceToLeaseTerms(user: TestUser) {
  await user.click(screen.getByRole("button", { name: "New tenant" }));
  await user.click(
    screen.getByRole("button", { name: "Complete individual tenant" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
}

function setLeaseDates(startDate = "2026-08-16", endDate = "2027-07-15") {
  const form = screen.getByRole("form", { name: "Add lease form" });
  fireEvent.input(form.elements.namedItem("leaseStartDate")!, {
    target: { value: startDate },
  });
  fireEvent.input(form.elements.namedItem("leaseEndDate")!, {
    target: { value: endDate },
  });
}

async function advanceToRentStep(user: TestUser) {
  await advanceToLeaseTerms(user);
  setLeaseDates();
  await user.click(screen.getByRole("button", { name: "Next" }));
}

async function advanceToBillingStep(user: TestUser) {
  await advanceToRentStep(user);
  const form = screen.getByRole("form", { name: "Add lease form" });
  fireEvent.change(form.elements.namedItem("monthlyRentAmount")!, {
    target: { value: "1000" },
  });
  fireEvent.change(form.elements.namedItem("rentDueDay")!, {
    target: { value: "5" },
  });
  await user.click(screen.getByRole("button", { name: "Next" }));
}

beforeEach(() => {
  createLeaseActionMock.mockReset();
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

describe("LeaseForm current-step validation", () => {
  it("cancels an unfinished whole-property lease without submitting", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<LeaseForm
      createContext={{ propertyId: "property-1", propertyLabel: "Harbor House", unitId: null, unitLabel: null }}
      onClose={onClose} properties={[]} tenants={[]} units={[]}
    />);
    await advanceToLeaseTerms(user);
    expect(screen.getByLabelText("Move-in context").textContent).toContain("Harbor House / Whole property");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createLeaseActionMock).not.toHaveBeenCalled();
  });

  it("keeps the selected unit and newly created tenant visible through back, denial and retry", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    createLeaseActionMock
      .mockResolvedValueOnce({ status: "error", message: "You do not have permission to prepare leases." })
      .mockResolvedValueOnce({ status: "success", message: "Draft created.", leaseId: "lease-new" });
    render(<LeaseForm
      createContext={{ propertyId: "property-1", propertyLabel: "Harbor House", unitId: "unit-1", unitLabel: "Unit 4" }}
      returnTo="/units/unit-1?section=lease"
      onClose={onClose} properties={[]} tenants={[]} units={[]}
    />);
    await advanceToBillingStep(user);
    expect(screen.getByLabelText("Move-in context").textContent).toContain("Harbor House / Unit 4");
    expect(screen.getByLabelText("Move-in context").textContent).toContain("Tenant: Ari Tenant");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox", { name: /Monthly rent/ }).getAttribute("value")).toBe("1000");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create draft lease" }));
    await screen.findByText("You do not have permission to prepare leases.");
    await user.click(screen.getByRole("button", { name: "Create draft lease" }));
    await screen.findByRole("form", { name: "Saved lease" });
    const first = createLeaseActionMock.mock.calls[0][1] as FormData;
    const retry = createLeaseActionMock.mock.calls[1][1] as FormData;
    for (const key of ["propertyId", "unitId", "tenantPersonId", "idempotencyKey", "monthlyRentAmount"]) {
      expect(retry.get(key)).toBe(first.get(key));
    }
    expect(retry.get("unitId")).toBe("unit-1");
    expect(retry.get("tenantPersonId")).toBe("11111111-1111-4111-8111-111111111111");
    expect(screen.queryByRole("navigation", { name: "Create lease steps" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create draft lease" })).toBeNull();
    expect(screen.getByRole("link", { name: "View rent and deposit" }).getAttribute("href"))
      .toBe(`/leases/lease-new?${new URLSearchParams({ section: "rent", returnTo: "/units/unit-1?section=lease" })}`);
    fireEvent.submit(screen.getByRole("form", { name: "Saved lease" }));
    expect(createLeaseActionMock).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("preserves the unit origin when opening a newly created draft", async () => {
    const user = userEvent.setup();
    createLeaseActionMock.mockResolvedValueOnce({ status: "success", message: "Draft created.", leaseId: "lease-new" });
    render(<LeaseForm returnTo="/units/unit-1" onClose={() => undefined} properties={[]} tenants={[]} units={[]} />);
    await advanceToBillingStep(user);
    await user.click(screen.getByRole("button", { name: "Create draft lease" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Open draft" }).getAttribute("href"))
      .toBe(`/leases/lease-new?${new URLSearchParams({ returnTo: "/units/unit-1" })}`));
    expect(createLeaseActionMock).toHaveBeenCalledTimes(1);
  });

  it("requires a selected tenant and leaves later empty steps out of Next validation", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm
        onClose={() => undefined}
        properties={[]}
        tenants={[
          {
            archived: false,
            description: "Tenant",
            id: "11111111-1111-4111-8111-111111111111",
            label: "Ari Tenant",
            partyType: "individual",
            roles: ["tenant"],
          },
        ]}
        units={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("alert").textContent).toBe("Choose a tenant.");
    const tenantPicker = screen.getByRole("combobox", { name: /Tenant/ });
    expect(document.activeElement).toBe(tenantPicker);
    expect(screen.getByRole("button", { name: "2 Lease terms" }).hasAttribute("disabled")).toBe(true);

    await user.type(tenantPicker, "Ari");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose a tenant.");
    expect(createLeaseActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("option", { name: /Ari Tenant/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Lease terms" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(createLeaseActionMock).not.toHaveBeenCalled();
  });

  it("requires both dates and rejects an edited end date before or on the start date", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm onClose={() => undefined} properties={[]} tenants={[]} units={[]} />,
    );
    await advanceToLeaseTerms(user);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose a date.");
    expect(document.activeElement).toBe(screen.getByLabelText("Lease start date"));

    const form = screen.getByRole("form", { name: "Add lease form" });
    fireEvent.input(form.elements.namedItem("leaseStartDate")!, {
      target: { value: "2026-08-16" },
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose a date.");
    expect(document.activeElement).toBe(screen.getByLabelText("Lease end date"));

    for (const endDate of ["2026-08-15", "2026-08-16"]) {
      fireEvent.input(form.elements.namedItem("leaseEndDate")!, {
        target: { value: endDate },
      });
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("alert").textContent).toBe("End date must be after the start date.");
      expect(screen.getByRole("heading", { name: "Lease terms" })).not.toBeNull();
    }

    setLeaseDates();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Rent and deposit" })).not.toBeNull();
    expect(createLeaseActionMock).not.toHaveBeenCalled();
  });

  it("rejects invalid edited rent, due day and deposit before advancing", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm onClose={() => undefined} properties={[]} tenants={[]} units={[]} />,
    );
    await advanceToRentStep(user);
    const rent = screen.getByRole("textbox", { name: /Monthly rent/ });
    const dueDay = screen.getByRole("textbox", { name: /Due each month on/ });
    const deposit = screen.getByRole("textbox", { name: "Deposit required" });

    for (const value of ["", "0", "not a number"]) {
      fireEvent.change(rent, { target: { value } });
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("alert").textContent).toBe("Enter a rent amount greater than zero.");
      expect(document.activeElement).toBe(rent);
    }
    await user.clear(rent);
    await user.type(rent, "1000");

    for (const value of ["", "32", "2.5"]) {
      fireEvent.change(dueDay, { target: { value } });
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("alert").textContent).toBe("Enter a due day from 1 to 31.");
      expect(document.activeElement).toBe(dueDay);
    }
    await user.clear(dueDay);
    await user.type(dueDay, "5");

    for (const value of ["-1", "not a number"]) {
      fireEvent.change(deposit, { target: { value } });
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("alert").textContent).toBe("Enter a valid non-negative deposit.");
      expect(document.activeElement).toBe(deposit);
    }
    await user.clear(deposit);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Billing setup" })).not.toBeNull();
    expect(createLeaseActionMock).not.toHaveBeenCalled();
  }, 15_000);

  it("validates the optional deposit receipt and permits correcting it", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm canRecordDepositReceipt onClose={() => undefined} properties={[]} tenants={[]} units={[]} />,
    );
    await advanceToRentStep(user);
    const form = screen.getByRole("form", { name: "Add lease form" });
    fireEvent.change(form.elements.namedItem("monthlyRentAmount")!, {
      target: { value: "1000" },
    });
    fireEvent.change(form.elements.namedItem("rentDueDay")!, {
      target: { value: "5" },
    });
    await user.click(screen.getByRole("combobox", { name: "Deposit received?" }));
    await user.click(screen.getByRole("option", { name: "Yes, received" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter the required deposit before recording its receipt.");

    fireEvent.change(form.elements.namedItem("depositAmount")!, {
      target: { value: "750" },
    });
    for (const [value, message] of [
      ["0", "Enter a received amount greater than zero."],
      ["751", "Received amount cannot exceed the required deposit."],
    ]) {
      fireEvent.change(form.elements.namedItem("depositReceivedAmount")!, {
        target: { value },
      });
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByRole("alert").textContent).toBe(message);
    }
    fireEvent.change(form.elements.namedItem("depositReceivedAmount")!, {
      target: { value: "750" },
    });
    fireEvent.input(form.elements.namedItem("depositReceivedOn")!, {
      target: { value: "" },
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose when the deposit was received.");
    expect(document.activeElement).toBe(screen.getByLabelText("Received on"));

    await user.click(screen.getByLabelText("Received on"));
    await user.click(screen.getByRole("button", { name: "Today", exact: true }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Billing setup" })).not.toBeNull();
    expect(createLeaseActionMock).not.toHaveBeenCalled();
  }, 15_000);

  it("keeps a visited later step behind validation after editing earlier dates", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm onClose={() => undefined} properties={[]} tenants={[]} units={[]} />,
    );
    await advanceToBillingStep(user);
    await user.click(screen.getByRole("button", { name: "2 Lease terms" }));
    setLeaseDates("2026-08-16", "2026-08-15");
    await user.click(screen.getByRole("button", { name: "4 Billing setup" }));

    expect(screen.getByRole("heading", { name: "Lease terms" })).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("End date must be after the start date.");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Tenant" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits the final step once while its server action is pending", async () => {
    const user = userEvent.setup();
    let resolveAction: (value: object) => void = () => undefined;
    createLeaseActionMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveAction = resolve;
    }));
    render(
      <LeaseForm onClose={() => undefined} properties={[]} tenants={[]} units={[]} />,
    );
    await advanceToBillingStep(user);
    const form = screen.getByRole("form", { name: "Add lease form" });

    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(createLeaseActionMock).toHaveBeenCalledTimes(1);
    expect(form.getAttribute("aria-busy")).toBe("true");
    fireEvent.submit(form);
    expect(createLeaseActionMock).toHaveBeenCalledTimes(1);

    await act(async () => resolveAction({}));
    expect(form.getAttribute("aria-busy")).toBe("false");
  });

  it("checks skipped steps in order and focuses the first invalid field after navigation", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm onClose={() => undefined} properties={[]} tenants={[]} units={[]} />,
    );
    await advanceToBillingStep(user);
    await user.click(screen.getByRole("button", { name: "3 Rent and deposit" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Monthly rent/ }), {
      target: { value: "0" },
    });
    await user.click(screen.getByRole("button", { name: "2 Lease terms" }));
    setLeaseDates("2026-08-16", "2026-08-15");
    await user.click(screen.getByRole("button", { name: "1 Tenant" }));
    await user.click(screen.getByRole("button", { name: "4 Billing setup" }));

    expect(screen.getByRole("heading", { name: "Lease terms" })).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("End date must be after the start date.");
    expect(document.activeElement).toBe(screen.getByLabelText("Lease end date"));

    setLeaseDates();
    await user.click(screen.getByRole("button", { name: "4 Billing setup" }));
    const rent = screen.getByRole("textbox", { name: /Monthly rent/ });
    expect(screen.getByRole("heading", { name: "Rent and deposit" })).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Enter a rent amount greater than zero.");
    expect(document.activeElement).toBe(rent);

    fireEvent.change(rent, { target: { value: "1000" } });
    await user.click(screen.getByRole("button", { name: "4 Billing setup" }));
    expect(screen.getByRole("heading", { name: "Billing setup" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(createLeaseActionMock).not.toHaveBeenCalled();
  });

  it("rechecks earlier values before final submission", async () => {
    const user = userEvent.setup();
    render(
      <LeaseForm onClose={() => undefined} properties={[]} tenants={[]} units={[]} />,
    );
    await advanceToBillingStep(user);
    setLeaseDates("2026-08-16", "2026-08-15");
    await user.click(screen.getByRole("button", { name: "Create draft lease" }));

    expect(screen.getByRole("heading", { name: "Lease terms" })).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("End date must be after the start date.");
    expect(document.activeElement).toBe(screen.getByLabelText("Lease end date"));
    expect(createLeaseActionMock).not.toHaveBeenCalled();

    setLeaseDates();
    await user.click(screen.getByRole("button", { name: "4 Billing setup" }));
    await user.click(screen.getByRole("button", { name: "Create draft lease" }));
    expect(createLeaseActionMock).toHaveBeenCalledTimes(1);
  });
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

    await advanceToBillingStep(user);
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

    await advanceToBillingStep(user);
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
      screen.getByText("Not supported yet"),
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

    await advanceToRentStep(user);

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

    await advanceToRentStep(user);

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
        name: "First or final month rent amount",
      }).textContent,
    ).toContain("Calculate automatically");
    expect(
      screen.queryByRole("textbox", { name: "First month rent amount (optional)" }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Final month rent amount (optional)" }),
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

      await advanceToBillingStep(user);
      await user.click(
        screen.getByRole("button", { name: "Change billing setup" }),
      );

      await chooseOption("Who collects rent?", "Collected by owner");
      await chooseOption("Management fee", "Flat amount");
      fireEvent.change(form.elements.namedItem("managementFeeValue")!, {
        target: { value: "125.50" },
      });
      await chooseOption(/^Charge management fee\?/, "No");
      await chooseOption("First or final month rent amount", "Use agreed rent amounts");
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
