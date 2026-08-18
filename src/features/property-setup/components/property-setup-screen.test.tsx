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
        step={5}
      />,
    );

    expect(screen.queryByText("Setup complete")).toBeNull();
    expect(screen.getByText("1 required next step")).toBeTruthy();
    expect(screen.queryByText("Owner roster")).toBeNull();
    expect(screen.getByText("Billing terms")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Complete Billing terms" }).getAttribute("href"),
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
      screen.getByRole("heading", { level: 2, name: "Review the linked setup" }),
    ).toBeTruthy();
    expect(screen.getByText("Whole property")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Unit" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open rent workspace" }).getAttribute("href"),
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
