/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertySetupScreen } from "@/features/property-setup/components/property-setup-screen";
import type { PropertySetupData } from "@/features/property-setup/property-setup.types";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/properties/setup",
  useRouter: () => ({ replace: navigation.replace }),
}));

beforeEach(() => {
  navigation.replace.mockReset();
});

afterEach(cleanup);

describe("PropertySetupScreen", () => {
  it("steers an occupied unit to its open lease and blocks new lease creation", () => {
    render(<PropertySetupScreen data={data} step={4} />);

    expect(
      screen.getByText(/This unit already has an open lease for Existing tenant/),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: "Create new lease",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Use existing lease" }));

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    const [href, options] = navigation.replace.mock.calls[0]!;
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/properties/setup");
    expect(url.searchParams.get("step")).toBe("5");
    expect(url.searchParams.get("leaseId")).toBe("lease-1");
    expect(url.searchParams.get("tenantId")).toBe("tenant-1");
    expect(options).toEqual({ scroll: false });
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
