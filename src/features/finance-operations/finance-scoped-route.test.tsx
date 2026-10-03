import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ data: vi.fn(), scope: vi.fn(), context: vi.fn(), unit: vi.fn(), screen: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireFinanceContext: mocks.context }));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({ getFinanceOperationsData: mocks.data, scopeFinanceOperationsData: mocks.scope }));
vi.mock("@/features/units/data/units", () => ({ getUnitDetail: mocks.unit }));
vi.mock("@/features/finance-operations/components/finance-operations-screen", () => ({ FinanceOperationsScreen: (props: Record<string, unknown>) => { mocks.screen(props); return <div>Scoped finance</div>; } }));
import PropertyFinancePage from "@/app/(dashboard)/properties/[propertyId]/finance/page";
import UnitFinancePage from "@/app/(dashboard)/units/[unitId]/finance/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ organizationId: "organization-1", organizationName: "Synthetic", capabilities: {}, permissionKeys: new Set(), userId: "user-1", isSuperAdmin: false });
  mocks.data.mockResolvedValue({ propertyOptions: [{ id: "property-1", label: "Property 1" }] });
  mocks.scope.mockReturnValue({});
  mocks.unit.mockResolvedValue({ id: "unit-1", propertyId: "property-1", unitLabel: "Unit 1" });
});

describe("scoped expense period navigation", () => {
  describe.each(["property", "unit"] as const)("%s month validation", kind => {
    it.each([undefined, "", "invalid", "2026-13", "0000-01", "2026-9", ["2026-09"], ["2026-09", "2026-10"]].map(expenseMonth => ({ expenseMonth })))("ignores malformed or repeated month values: $expenseMonth", async ({ expenseMonth }) => {
      const searchParams = Promise.resolve({ view: "expenses", expenseMonth });
      const page = kind === "property"
        ? await PropertyFinancePage({ params: Promise.resolve({ propertyId: "property-1" }), searchParams })
        : await UnitFinancePage({ params: Promise.resolve({ unitId: "unit-1" }), searchParams });
      renderToStaticMarkup(page);
      expect(mocks.data).toHaveBeenCalledWith("organization-1", "property-1", expect.objectContaining({ expenseMonth: "" }));
      expect(mocks.screen.mock.calls[0][0]).toMatchObject({ expenseMonth: "", view: "expenses" });
    });
  });

  it.each(["property", "unit"] as const)("loads the selected month inside the authorized %s scope", async kind => {
    const searchParams = Promise.resolve({ view: "expenses", expenseMonth: "2026-09" });
    const page = kind === "property"
      ? await PropertyFinancePage({ params: Promise.resolve({ propertyId: "property-1" }), searchParams })
      : await UnitFinancePage({ params: Promise.resolve({ unitId: "unit-1" }), searchParams });
    renderToStaticMarkup(page);
    expect(mocks.context).toHaveBeenCalledOnce();
    expect(mocks.data).toHaveBeenCalledWith("organization-1", "property-1", expect.objectContaining({ expenseMonth: "2026-09" }));
    expect(mocks.scope).toHaveBeenCalledWith(expect.anything(), kind === "property" ? { propertyId: "property-1" } : { propertyId: "property-1", unitId: "unit-1" });
    expect(mocks.screen.mock.calls[0][0]).toMatchObject({ expenseMonth: "2026-09", view: "expenses", scope: { id: `${kind}-1`, kind, propertyId: "property-1" }, canViewLeases: false });
  });
});
