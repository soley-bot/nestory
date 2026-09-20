// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionWorkspace } from "./transaction-workspace";
import type { FinanceOperationsData } from "../finance-operations.types";
vi.mock("@/lib/dates/business-date", () => ({getBusinessMonthValue: () => "2026-09"}));
afterEach(cleanup);
const data: FinanceOperationsData = { tenantInvoices: [], accountEntries: [], expenseSubmissions: [], positions: [], leases: [], expenseAccounts: [], financeCategories: [], leaseChargeAccounts: [], leaseDepositAccounts: [], ownerInvoices: [], payFromAccounts: [], peopleOptions: [], propertyOptions: [], reconciliationSources: [], rentGenerationExceptions: [], unitOptions: [] };
const callbacks = {onOpenInvoice: vi.fn(),onOpenExpense: vi.fn(),renderAccountActions: () => null};
describe("TransactionWorkspace", () => {
  it("shows a clear filtered empty state and hides unauthorized reports and mutations", () => {
    render(<TransactionWorkspace data={data} scope={{propertyId:"property-a"}} canReadReports={false} {...callbacks} />);
    expect(screen.getByText("No transactions match this period and filters.")).not.toBeNull();
    expect(screen.queryByText("Reports")).toBeNull();expect(screen.queryByText("Add charge")).toBeNull();
    fireEvent.change(screen.getByRole("textbox",{name:"Search transactions"}),{target:{value:"missing"}});
    expect(screen.getByText("No transactions match this period and filters.")).not.toBeNull();
  });
  it("passes the effective unit to create controls", () => {
    const actions=vi.fn(() => <button>Create scoped charge</button>);
    render(<TransactionWorkspace data={data} scope={{propertyId:"property-a",unitId:"unit-a"}} canReadReports={false} actions={actions} {...callbacks} />);
    expect(actions).toHaveBeenLastCalledWith({propertyId:"property-a",unitId:"unit-a"});
  });
  it("keeps unit P&L export context and labels owner cash scope", () => {
    render(<TransactionWorkspace data={data} scope={{propertyId:"property-a",unitId:"unit-a"}} canReadReports {...callbacks} />);
    fireEvent.click(screen.getByText("Reports"));
    expect(screen.getByRole("link",{name:"P&L PDF"}).getAttribute("href")).toContain("month=2026-09&propertyId=property-a&unitId=unit-a");
    expect(screen.getByRole("link",{name:"Owner statement (property)"})).not.toBeNull();
    expect(screen.queryByText("Owner cash held · current")).toBeNull();
  });
});
