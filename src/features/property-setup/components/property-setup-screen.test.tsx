/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertySetupScreen } from "@/features/property-setup/components/property-setup-screen";
import type { PropertySetupData } from "@/features/property-setup/property-setup.types";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  createLease: vi.fn(),
  activateLease: vi.fn(),
}));

vi.mock("@/features/leases/actions", () => ({
  createLeaseAction: navigation.createLease,
  updateLeaseAction: vi.fn(),
}));
vi.mock("@/features/property-setup/actions", () => ({
  activateSetupLeaseAction: navigation.activateLease,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/properties/setup",
  useRouter: () => ({ replace: navigation.replace }),
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.createLease.mockReset();
  navigation.activateLease.mockReset();
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(cleanup);

describe("PropertySetupScreen", () => {
  it("daily workflow submits the moved-in setup lease and exact billing values through visible controls", async () => {
    const user = userEvent.setup();
    navigation.createLease.mockResolvedValue({ status: "success", message: "Lease saved.", leaseId: "lease-1" });
    render(<PropertySetupScreen data={creationData} step={3} />);
    await user.click(screen.getByRole("button", { name: "Create new lease" }));
    const form = screen.getByRole("form", { name: "Add lease form" }) as HTMLFormElement;
    await user.click(within(form).getByRole("button", { name: "Next" }));
    for (const [name, value] of [["leaseStartDate", "2026-10-01"], ["leaseEndDate", "2027-04-01"]]) {
      const input = form.elements.namedItem(name!);
      if (!(input instanceof HTMLInputElement)) throw new Error(`Expected input ${name}`);
      fireEvent.input(input, { target: { value } });
    }
    await user.click(within(form).getByRole("combobox", { name: /^Move-in status(?:\s*\(required\))?$/ }));
    await user.click(screen.getByRole("option", { name: "Tenant moved in on the lease start date" }));
    await user.click(within(form).getByRole("button", { name: "Next" }));
    for (const [name, value] of [["monthlyRentAmount", "120"], ["rentDueDay", "1"], ["depositAmount", "0"]]) {
      const input = form.elements.namedItem(name!);
      if (!(input instanceof HTMLInputElement)) throw new Error(`Expected input ${name}`);
      fireEvent.change(input, { target: { value } });
    }
    await user.click(within(form).getByRole("button", { name: "Next" }));
    await user.click(within(form).getByRole("button", { name: "Change billing setup" }));
    await user.click(within(form).getByRole("combobox", { name: "Who collects rent?" }));
    await user.click(screen.getByRole("option", { name: /^Collected by (?!owner$)/ }));
    await user.click(within(form).getByRole("combobox", { name: "Management fee" }));
    await user.click(screen.getByRole("option", { name: "Percentage" }));
    const managementFeeValue = form.elements.namedItem("managementFeeValue");
    if (!(managementFeeValue instanceof HTMLInputElement)) throw new Error("Expected management fee input");
    fireEvent.change(managementFeeValue, { target: { value: "8" } });
    await user.click(within(form).getByRole("button", { name: "Save tenant and lease" }));
    await waitFor(() => expect(navigation.createLease).toHaveBeenCalledTimes(1));
    const payload = navigation.createLease.mock.calls[0]![1] as FormData;
    for (const [name, value] of Object.entries({ status: "active", actualMoveInDate: "2026-10-01", leaseStartDate: "2026-10-01", leaseEndDate: "2027-04-01", monthlyRentAmount: "120", rentDueDay: "1", depositAmount: "0", collectionRoute: "through_ips", managementFeeMode: "percentage", managementFeeValue: "8" })) {
      expect(payload.get(name), name).toBe(value);
    }
  });

  it("keeps lease review available after the actual parent closes creation, back and refresh", async () => {
    const user = userEvent.setup();
    let resolveSave!: (value: object) => void;
    navigation.createLease.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    const journey = render(<PropertySetupScreen data={creationData} step={3} />);
    await user.click(screen.getByRole("button", { name: "Create new lease" }));
    const form = await fillSetupLease(user);
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(navigation.createLease).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Create lease" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.getByRole("alertdialog", { name: "Saving is still in progress" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue waiting" }));
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => resolveSave({ status: "success", message: "Lease saved.", leaseId: "lease-1" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Create lease" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Saved lease" })).toBeNull();
    const destination = new URL(navigation.replace.mock.calls[0]![0], "https://nestory.invalid");
    expect(destination.searchParams.get("step")).toBe("4");
    for (const key of ["ownerId", "propertyId", "unitId", "tenantId", "leaseId"] as const) {
      expect(destination.searchParams.get(key)).toBe(savedData.selection[key]);
    }
    journey.rerender(<PropertySetupScreen data={savedData} step={4} />);
    expectReviewLinks(destination.pathname + destination.search);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    expect(navigation.activateLease).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(new URL(navigation.replace.mock.calls[1]![0], "https://nestory.invalid").searchParams.get("step")).toBe("3");
    journey.rerender(<PropertySetupScreen data={savedData} step={3} />);
    expect((screen.getByRole("button", { name: "Create new lease" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    journey.rerender(<PropertySetupScreen data={savedData} step={4} />);
    expectReviewLinks(destination.pathname + destination.search);
    journey.unmount();
    render(<PropertySetupScreen data={savedData} step={4} />);
    expectReviewLinks(destination.pathname + destination.search);
    expect(navigation.createLease).toHaveBeenCalledTimes(1);
    expect(navigation.activateLease).not.toHaveBeenCalled();
  });

  it("retains failed creation for retry and carries the saved lease into setup without activating it", async () => {
    const user = userEvent.setup();
    navigation.createLease
      .mockResolvedValueOnce({ status: "error", message: "This unit is already reserved for those dates." })
      .mockResolvedValueOnce({ status: "success", message: "Lease saved.", leaseId: "lease-1" });
    const journey = render(<PropertySetupScreen data={creationData} step={3} />);
    await user.click(screen.getByRole("button", { name: "Create new lease" }));
    await fillSetupLease(user);
    await user.click(screen.getByRole("button", { name: "Save tenant and lease" }));
    await screen.findByText("This unit is already reserved for those dates.");
    expect(screen.getByRole("dialog", { name: "Create lease" })).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save tenant and lease" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    for (const key of ["propertyId", "unitId", "tenantPersonId", "idempotencyKey"]) {
      expect(navigation.createLease.mock.calls[1]![1].get(key)).toBe(navigation.createLease.mock.calls[0]![1].get(key));
    }
    journey.rerender(<PropertySetupScreen data={savedData} step={4} />);
    expect(screen.getByRole("link", { name: "View rent and deposit" })).toBeTruthy();
    expect(navigation.activateLease).not.toHaveBeenCalled();
  });

  it("cancels creation without navigation or writes and keeps the selected placement on reopen", async () => {
    const user = userEvent.setup();
    render(<PropertySetupScreen data={creationData} step={3} />);
    await user.click(screen.getByRole("button", { name: "Create new lease" }));
    await screen.findByRole("form", { name: "Add lease form" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Create lease" })).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.createLease).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create new lease" }));
    const form = await screen.findByRole("form", { name: "Add lease form" });
    expect(new FormData(form as HTMLFormElement).get("unitId")).toBe("unit-1");
    expect(new FormData(form as HTMLFormElement).get("tenantPersonId")).toBe("tenant-1");
    await user.click(within(form).getByRole("button", { name: "Next" }));
    fireEvent.input((form as HTMLFormElement).elements.namedItem("leaseStartDate") as HTMLInputElement, { target: { value: "2026-07-01" } });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog", { name: "Create lease" })).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.createLease).not.toHaveBeenCalled();
  });

  it("keeps review links on completed setup without changing first-rent navigation", () => {
    render(<PropertySetupScreen data={{ ...savedData, readiness: { ...savedData.readiness!, ready: true, items: [] } }} step={5} />);
    expectReviewLinks(`/properties/setup?${new URLSearchParams({ step: "5", ...savedData.selection as Record<string, string> })}`);
    expect(screen.getByRole("link", { name: "Review first rent charge" }).getAttribute("href")).toBe("/rent-income?leaseId=lease-1");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(navigation.activateLease).not.toHaveBeenCalled();
  });
  it("steers an occupied unit to its open lease and blocks new lease creation", () => {
    render(<PropertySetupScreen data={data} step={3} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Set up property" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Connect the tenant through a lease",
      }),
    ).toBeTruthy();

    expect(
      screen.getByText(
        /This unit already has an open lease for Existing tenant/,
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Create new lease",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Use existing lease" }));

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    const [href, options] = navigation.replace.mock.calls[0]!;
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/properties/setup");
    expect(url.searchParams.get("step")).toBe("4");
    expect(url.searchParams.get("leaseId")).toBe("lease-1");
    expect(url.searchParams.get("tenantId")).toBe("tenant-1");
    expect(options).toEqual({ scroll: false });
  });

  it("keeps setup open and links the exact authority that blocks rent readiness", () => {
    render(
      <PropertySetupScreen
        data={{
          ...data,
          readiness: {
            effectiveDate: "2026-08-11",
            items: [
              {
                code: "owner_roster",
                label: "Owner roster",
                ready: true,
                repairHref: "/properties/property-1",
              },
              {
                code: "billing",
                label: "Billing terms",
                ready: false,
                repairHref: "/rent-income?leaseId=lease-1&action=billing",
              },
            ],
            leaseId: "lease-1",
            organizationId: "organization-1",
            propertyId: "property-1",
            ready: false,
            unitId: "unit-1",
          },
          selection: {
            leaseId: "lease-1",
            ownerId: "owner-1",
            propertyId: "property-1",
            tenantId: "tenant-1",
            unitId: "unit-1",
          },
        }}
        step={4}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Finish rent setup" }),
    ).toBeTruthy();
    expect(screen.queryByText("Setup complete")).toBeNull();
    expect(screen.getByText("1 required next step")).toBeTruthy();
    expect(screen.queryByText("Owner roster")).toBeNull();
    expect(screen.getByText("Billing terms")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Complete Billing terms" })
        .getAttribute("href"),
    ).toBe("/rent-income?leaseId=lease-1&action=billing");
    expect(screen.queryByText("2 readiness checks")).toBeNull();
    expect(screen.queryByRole("link", { name: "Owner" })).toBeNull();
  });

  it("renders the final review for a whole-property lease without requiring a unit", () => {
    render(
      <PropertySetupScreen
        data={{
          ...data,
          leases: [
            {
              ...data.leases[0]!,
              unitId: null,
            },
          ],
          properties: [
            {
              ...data.properties[0]!,
              rentalStructure: "single_space",
            },
          ],
          readiness: null,
          selection: {
            leaseId: "lease-1",
            ownerId: "owner-1",
            propertyId: "property-1",
            tenantId: "tenant-1",
            unitId: null,
          },
          units: [],
        }}
        step={5}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Rental setup complete" }),
    ).toBeTruthy();
    expect(screen.getByText("Whole property")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Unit" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Review first rent charge" })
        .getAttribute("href"),
    ).toBe("/rent-income?leaseId=lease-1");
  });
});

const data: PropertySetupData = {
  leases: [
    {
      endDate: "2027-06-30",
      id: "lease-1",
      label: "Existing tenant · 2026-07-01 to 2027-06-30",
      monthlyRentAmount: 900,
      propertyId: "property-1",
      startDate: "2026-07-01",
      status: "active",
      tenantPersonId: "tenant-1",
      unitId: "unit-1",
    },
  ],
  owners: [
    {
      archived: false,
      description: "Owner",
      id: "owner-1",
      label: "Owner One",
      roles: ["owner"],
    },
  ],
  properties: [
    {
      id: "property-1",
      label: "HOME · Home Residence",
      ownerPersonId: "owner-1",
      rentalStructure: "multi_unit",
    },
  ],
  selection: {
    leaseId: null,
    ownerId: "owner-1",
    propertyId: "property-1",
    tenantId: null,
    unitId: "unit-1",
  },
  tenants: [
    {
      archived: false,
      description: "Tenant",
      id: "tenant-1",
      label: "Existing tenant",
      roles: ["tenant"],
    },
  ],
  units: [
    {
      id: "unit-1",
      label: "HOME / 1A",
      propertyId: "property-1",
      statusLabel: "occupied",
    },
  ],
};

const creationData: PropertySetupData = {
  ...data,
  leases: [],
  selection: { ...data.selection, tenantId: "tenant-1" },
  tenants: [{ ...data.tenants[0]!, partyType: "individual" }],
  units: [{ ...data.units[0]!, statusLabel: "vacant" }],
};
const savedData: PropertySetupData = {
  ...creationData,
  leases: [{ ...data.leases[0]!, status: "draft" }],
  selection: { ...creationData.selection, leaseId: "lease-1" },
  readiness: {
    ready: false, effectiveDate: "2026-07-01", organizationId: "organization-1",
    leaseId: "lease-1", propertyId: "property-1", unitId: "unit-1",
    items: [{ code: "lease", label: "Lease activation", ready: false, repairHref: "/leases/lease-1" }],
  },
};

async function fillSetupLease(user: ReturnType<typeof userEvent.setup>) {
  const form = await screen.findByRole("form", { name: "Add lease form" }) as HTMLFormElement;
  await user.click(within(form).getByRole("button", { name: "Next" }));
  fireEvent.input(form.elements.namedItem("leaseStartDate") as HTMLInputElement, { target: { value: "2026-07-01" } });
  fireEvent.input(form.elements.namedItem("leaseEndDate") as HTMLInputElement, { target: { value: "2027-06-30" } });
  await user.click(within(form).getByRole("button", { name: "Next" }));
  fireEvent.change(form.elements.namedItem("monthlyRentAmount") as HTMLInputElement, { target: { value: "900" } });
  fireEvent.change(form.elements.namedItem("rentDueDay") as HTMLInputElement, { target: { value: "5" } });
  await user.click(within(form).getByRole("button", { name: "Next" }));
  return form;
}

function expectReviewLinks(returnTo: string) {
  for (const [label, section] of [["Open lease", null], ["View rent and deposit", "rent"]] as const) {
    const link = screen.getByRole("link", { name: label });
    const url = new URL(link.getAttribute("href")!, "https://nestory.invalid");
    expect(url.pathname).toBe("/leases/lease-1");
    expect(url.searchParams.get("section")).toBe(section);
    const actualReturn = new URL(url.searchParams.get("returnTo")!, "https://nestory.invalid");
    const expectedReturn = new URL(returnTo, "https://nestory.invalid");
    expect(actualReturn.pathname).toBe(expectedReturn.pathname);
    expect(Object.fromEntries(actualReturn.searchParams)).toEqual(Object.fromEntries(expectedReturn.searchParams));
  }
}
