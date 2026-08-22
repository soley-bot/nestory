import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUnitPropertyOptions,
  getUnitsScreenData,
  requirePermission,
} = vi.hoisted(() => ({
  getUnitPropertyOptions: vi.fn(),
  getUnitsScreenData: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/features/units/data/units", () => ({
  getUnitPropertyOptions,
  getUnitsScreenData,
}));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));

import UnitsPage from "./page";

describe("UnitsPage authority", () => {
  beforeEach(() => {
    getUnitPropertyOptions.mockReset();
    getUnitsScreenData.mockReset();
    requirePermission.mockReset();
    getUnitPropertyOptions.mockResolvedValue([]);
    getUnitsScreenData.mockResolvedValue({
      pagination: { totalCount: 0 },
      units: [],
    });
  });

  it("allows exact properties.view access without exposing creation", async () => {
    requirePermission.mockResolvedValue({
      organizationId: "organization-1",
      permissionKeys: new Set(["properties.view"]),
    });

    const screen = await UnitsPage({ searchParams: Promise.resolve({}) });

    expect(requirePermission).toHaveBeenCalledWith("properties.view");
    expect(screen.props.canCreate).toBe(false);
  });

  it("derives Unit creation from properties.write", async () => {
    requirePermission.mockResolvedValue({
      organizationId: "organization-1",
      permissionKeys: new Set(["properties.view", "properties.write"]),
    });

    const screen = await UnitsPage({ searchParams: Promise.resolve({}) });

    expect(screen.props.canCreate).toBe(true);
  });
});
