// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/owner-balances/owner-cash-actions", () => ({ recordOwnerContributionAction: vi.fn(), correctOwnerDistributionDateAction: vi.fn() }));
vi.mock("@/components/ui/date-picker-field", () => ({ DatePickerField: ({ ariaLabel, name, defaultValue }: { ariaLabel: string; name: string; defaultValue: string }) => <input aria-label={ariaLabel} name={name} defaultValue={defaultValue} /> }));
import { OwnerContributionControl, OwnerDistributionDateControl } from "./owner-cash-controls";
describe("owner cash controls", () => {
  afterEach(cleanup);
  it("hides actions without their capabilities", () => {
    render(<><OwnerContributionControl canRecordOwnerCash={false} propertyId="property" ownerPersonId="owner" ownerLabel="Owner" /><OwnerDistributionDateControl canCorrectFinance={false} propertyId="property" withdrawalId="withdrawal" originalDate="2026-09-01" amount="20.00" /></>);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows scoped contribution fields", () => {
    render(<OwnerContributionControl canRecordOwnerCash propertyId="property" ownerPersonId="owner" ownerLabel="Alex Owner" />);
    fireEvent.click(screen.getByRole("button", { name: "Record owner contribution" }));
    expect(screen.getByText("Owner: Alex Owner")).toBeTruthy();
    expect(screen.getByLabelText("Amount (USD)")).toBeTruthy();
    expect(screen.getByLabelText("Contribution date")).toBeTruthy();
  });
  it("shows original amount/date and explicit confirmation", () => {
    render(<OwnerDistributionDateControl canCorrectFinance propertyId="property" withdrawalId="actual-withdrawal" originalDate="2026-09-01" amount="20.00" />);
    fireEvent.click(screen.getByRole("button", { name: "Correct date" }));
    expect(screen.getByText("20.00 USD")).toBeTruthy();
    expect(screen.getByText("2026-09-01")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm date correction" })).toBeTruthy();
    expect((document.querySelector('input[name="withdrawalId"]') as HTMLInputElement).value).toBe("actual-withdrawal");
  });
});
