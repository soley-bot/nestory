/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), unit: vi.fn(), finance: vi.fn(), scope: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceContext: mocks.context }));
vi.mock("@/features/units/data/units", () => ({ getUnitDetail: mocks.unit }));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({ getFinanceOperationsData: mocks.finance, scopeFinanceOperationsData: mocks.scope }));
vi.mock("@/features/finance-operations/components/finance-operations-screen", () => ({ FinanceOperationsScreen: () => <div>Scoped finance</div> }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
import UnitFinancePage from "./page";

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ organizationId: "org", permissionKeys: new Set(["finance.view", "leases.view"]), capabilities: {} });
  mocks.unit.mockResolvedValue({ id: "existing-unit", propertyId: "property", unitNumber: "A01", propertyName: "Central" });
  mocks.finance.mockResolvedValue({});
  mocks.scope.mockReturnValue({});
  mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
});

describe("unit finance access", () => {
  it("does not misreport an existing unit as missing for a finance-only role or query property records", async () => {
    const origin = "/leases/lease-1?section=rent&returnTo=%2Fleases%3Fq%3DDara%26page%3D2";
    render(await UnitFinancePage({ params: Promise.resolve({ unitId: "existing-unit" }), searchParams: Promise.resolve({ view: "rent", returnTo: origin }) }));
    expect(screen.getByRole("alert").textContent).toContain("Your current access does not include property records");
    expect(screen.getByRole("link", { name: "Back to previous page" }).getAttribute("href")).toBe(origin);
    expect(screen.getByRole("link", { name: "Open Finance" }).getAttribute("href")).toBe("/rent-income");
    expect(mocks.unit).not.toHaveBeenCalled();
    expect(mocks.finance).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(screen.queryByText("Unit not found")).toBeNull();
  });

  it.each(["https://evil.invalid", "//evil.invalid", ["/leases/one", "/leases/two"]])("rejects unsafe or ambiguous return context %s", async (returnTo) => {
    render(await UnitFinancePage({ params: Promise.resolve({ unitId: "unknown-unit" }), searchParams: Promise.resolve({ returnTo }) }));
    expect(screen.queryByRole("link", { name: "Back to previous page" })).toBeNull();
    expect(mocks.unit).not.toHaveBeenCalled();
  });

  it("retains scoped finance for property-authorized roles", async () => {
    mocks.context.mockResolvedValue({ organizationId: "org", permissionKeys: new Set(["finance.view", "properties.view"]), capabilities: {} });
    render(await UnitFinancePage({ params: Promise.resolve({ unitId: "existing-unit" }) }));
    expect(screen.getByText("Scoped finance")).toBeTruthy();
    expect(mocks.unit).toHaveBeenCalledWith("org", "existing-unit");
    expect(mocks.scope).toHaveBeenCalledWith({}, { propertyId: "property", unitId: "existing-unit" });
  });

  it("keeps genuine unavailable records unavailable for property-authorized roles", async () => {
    mocks.context.mockResolvedValue({ organizationId: "org", permissionKeys: new Set(["finance.view", "properties.view"]), capabilities: {} });
    mocks.unit.mockResolvedValue(null);
    await expect(UnitFinancePage({ params: Promise.resolve({ unitId: "missing-unit" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.finance).not.toHaveBeenCalled();
  });
});
