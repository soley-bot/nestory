// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../owner-transaction-correction-actions", () => ({ correctOwnerTransactionAction: mocks.action }));
vi.mock("@/components/ui/date-picker-field", () => ({ DatePickerField: ({ ariaLabel, defaultValue, onValueChange }: { ariaLabel: string; defaultValue: string; onValueChange: (value: string) => void }) => <input aria-label={ariaLabel} defaultValue={defaultValue} onChange={event => onValueChange(event.target.value)} /> }));
import { OwnerTransactionCorrectionDialog } from "./owner-transaction-correction-dialog";
const entry = { id: "transaction", kind: "distribution" as const, date: "2026-01-01", amount: "20.00", reference: "January payout" };
function mount(extra = {}) { return render(<OwnerTransactionCorrectionDialog open onOpenChange={vi.fn()} canCorrectFinance propertyId="property" entry={entry} {...extra} />); }
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("transaction correction review", () => {
  it("does not expose correction fields without authority", () => { mount({ canCorrectFinance: false }); expect(screen.queryByRole("dialog")).toBeNull(); });
  it("reviews amount/reference changes without saving and requires explicit confirmation", async () => {
    const user = userEvent.setup(); mount();
    await user.clear(screen.getByLabelText("Amount (USD)")); await user.type(screen.getByLabelText("Amount (USD)"), "25.5");
    await user.clear(screen.getByLabelText("Reference")); await user.type(screen.getByLabelText("Reference"), "Corrected payout");
    await user.type(screen.getByLabelText("Reason for correction"), "Correct bank amount");
    await user.click(screen.getByRole("button", { name: "Review correction" }));
    const review = screen.getByRole("table", { name: "Review transaction correction" });
    expect(within(review).getByText("20.00")).toBeTruthy();
    expect(within(review).getByText("25.50")).toBeTruthy();
    expect(within(review).getByText("Corrected payout")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm correction" })).toBeTruthy();
    expect(mocks.action).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back to edit" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect((screen.getByLabelText("Amount (USD)") as HTMLInputElement).value).toBe("25.5");
    await user.clear(screen.getByLabelText("Amount (USD)")); await user.type(screen.getByLabelText("Amount (USD)"), "30");
    await user.click(screen.getByRole("button", { name: "Review correction" }));
    expect(screen.getByText("30.00")).toBeTruthy();
    expect(screen.queryByText("25.50")).toBeNull();
  });
  it.each(["0", "-2", "1.001", "1e2"])("rejects invalid exact amount %s before review", async amount => {
    const user = userEvent.setup(); mount();
    await user.clear(screen.getByLabelText("Amount (USD)")); await user.type(screen.getByLabelText("Amount (USD)"), amount);
    await user.type(screen.getByLabelText("Reason for correction"), "Correct wrong amount");
    await user.click(screen.getByRole("button", { name: "Review correction" }));
    expect(screen.getByRole("alert").textContent).toContain("amount greater than zero");
    expect(screen.queryByRole("button", { name: "Confirm correction" })).toBeNull();
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("rejects unchanged values even with a reason", async () => {
    const user = userEvent.setup(); mount();
    await user.type(screen.getByLabelText("Reason for correction"), "Review same values");
    await user.click(screen.getByRole("button", { name: "Review correction" }));
    expect(screen.getByRole("alert").textContent).toContain("Change the date, amount, or reference");
  });
  it.each(["2026-02-30", "2999-01-01"])("rejects invalid or future date %s before review", async date => {
    const user = userEvent.setup(); mount();
    await user.clear(screen.getByLabelText("Correction date")); await user.type(screen.getByLabelText("Correction date"), date);
    await user.type(screen.getByLabelText("Reason for correction"), "Correct payment date");
    await user.click(screen.getByRole("button", { name: "Review correction" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm correction" })).toBeNull();
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("keeps reviewed values visible when the server rejects the correction", async () => {
    mocks.action.mockResolvedValueOnce({ status: "error", message: "The affected month is closed." });
    const user = userEvent.setup(); mount();
    await user.clear(screen.getByLabelText("Amount (USD)")); await user.type(screen.getByLabelText("Amount (USD)"), "30");
    await user.type(screen.getByLabelText("Reason for correction"), "Correct bank amount");
    await user.click(screen.getByRole("button", { name: "Review correction" }));
    await user.click(screen.getByRole("button", { name: "Confirm correction" }));
    expect((await screen.findByRole("alert")).textContent).toContain("month is closed");
    expect(screen.getByText("30.00")).toBeTruthy();
    expect(mocks.action).toHaveBeenCalledOnce();
    const payload = mocks.action.mock.calls[0][1] as FormData;
    expect(payload.get("originalId")).toBe(entry.id);
    expect(payload.get("amount")).toBe("30.00");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("resets unsaved fields after close and reopen", async () => {
    const user = userEvent.setup(); const view = mount();
    await user.type(screen.getByLabelText("Reference"), " edited");
    view.rerender(<OwnerTransactionCorrectionDialog open={false} onOpenChange={vi.fn()} canCorrectFinance propertyId="property" entry={entry} />);
    view.rerender(<OwnerTransactionCorrectionDialog open onOpenChange={vi.fn()} canCorrectFinance propertyId="property" entry={entry} />);
    expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe("January payout");
  });
});
