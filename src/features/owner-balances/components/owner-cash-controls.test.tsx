// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/owner-balances/owner-cash-actions", () => ({ recordOwnerContributionAction: vi.fn(), correctOwnerDistributionDateAction: vi.fn() }));
import { BusinessDateProvider } from "@/lib/dates/business-date-provider";
import { recordOwnerContributionAction } from "../owner-cash-actions";
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
    expect(screen.getByText("Alex Owner")).toBeTruthy();
    expect(screen.getByLabelText("Amount (USD)")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Contribution date" })).toBeTruthy();
  });
  it("shows original amount/date and explicit confirmation", () => {
    render(<OwnerDistributionDateControl canCorrectFinance propertyId="property" withdrawalId="actual-withdrawal" originalDate="2026-09-01" amount="20.00" />);
    fireEvent.click(screen.getByRole("button", { name: "Correct date" }));
    expect(screen.getByText("20.00 USD")).toBeTruthy();
    expect(screen.getAllByText(/01 Sept? 2026/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Confirm date correction" })).toBeTruthy();
    expect((document.querySelector('input[name="withdrawalId"]') as HTMLInputElement).value).toBe("actual-withdrawal");
  });
  it("opens on the selected transaction month and records the day chosen by staff", async () => {
    vi.mocked(recordOwnerContributionAction).mockResolvedValueOnce({ status: "success", message: "Contribution saved for 14 Oct 2026.", activityHref: "/properties/property/account?month=2026-10&activity=owner_cash" });
    render(<BusinessDateProvider businessDate="2026-11-27" timeZone="Asia/Phnom_Penh"><OwnerContributionControl canRecordOwnerCash propertyId="property" ownerPersonId="owner" ownerLabel="Owner" selectedMonth="2026-10" /></BusinessDateProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Record owner contribution" }));
    const submit = screen.getByRole("button", { name: "Record contribution" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("combobox", { name: "Contribution date" }));
    fireEvent.click(screen.getByRole("grid").querySelector('[data-day="2026-10-14"] button')!);
    expect(submit.disabled).toBe(false);
    expect(screen.getByText("Appears under Owner funding contributions for October 2026.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Amount (USD)"), { target: { value: "615.38" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Owner paid funds" } });
    fireEvent.click(submit);
    expect((await screen.findByRole("link", { name: "View owner account activity" })).getAttribute("href")).toContain("month=2026-10");
    expect(vi.mocked(recordOwnerContributionAction).mock.calls[0][1].get("eventDate")).toBe("2026-10-14");
  });
});
