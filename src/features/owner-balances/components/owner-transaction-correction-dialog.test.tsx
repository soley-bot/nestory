// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PILOT_ORGANIZATION_ID } from "@/lib/pilot-organization";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/finance/financial-write-provider", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/finance/financial-write-provider")>(), useFinancialWriteContext: mocks.session,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../owner-transaction-correction-actions", () => ({ correctOwnerTransactionAction: mocks.action }));
vi.mock("@/components/ui/date-picker-field", () => ({ DatePickerField: ({ ariaLabel, defaultValue, onValueChange }: { ariaLabel: string; defaultValue: string; onValueChange: (value: string) => void }) => <input aria-label={ariaLabel} defaultValue={defaultValue} onChange={event => onValueChange(event.target.value)} /> }));
import { OwnerTransactionCorrectionDialog } from "./owner-transaction-correction-dialog";
const entry = { id: "transaction", kind: "distribution" as const, date: "2026-01-01", amount: "20.00", reference: "January payout" };
function mount(extra = {}) { return render(<OwnerTransactionCorrectionDialog open onOpenChange={vi.fn()} canCorrectFinance propertyId="property" entry={entry} {...extra} />); }
afterEach(() => { cleanup(); vi.resetAllMocks(); });
beforeEach(() => { mocks.session.mockReturnValue({ organizationId: PILOT_ORGANIZATION_ID }); });
describe("transaction correction review", () => {
  it("requires review before a correction in another workspace", async () => {
    mocks.session.mockReturnValue({ organizationId: "another-workspace" });
    mocks.action.mockResolvedValue({status:"success"});
    const user = userEvent.setup(); mount();
    await user.clear(screen.getByLabelText("Amount (USD)"));
    await user.type(screen.getByLabelText("Amount (USD)"), "25.50");
    await user.type(screen.getByLabelText("Reason for correction"), "Correct bank amount");
    await user.click(screen.getByRole("button", { name: "Review correction" }));
    expect(mocks.action).not.toHaveBeenCalled();
    expect(screen.getByText("USD 25.50")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm correction" }));
    expect(mocks.action).toHaveBeenCalledOnce();
  });
  it.each([false, true])("offers fee recovery only with administrator authority: %s", async canRecoverOwnerDistribution => {
    mocks.action.mockResolvedValueOnce({status:"error", message:"Not enough cash on the corrected date."});
    const user = userEvent.setup(); mount({canRecoverOwnerDistribution});
    await user.clear(screen.getByLabelText("Correction date"));
    await user.type(screen.getByLabelText("Correction date"), "2026-01-02");
    await user.type(screen.getByLabelText("Reason for correction"), "Correct payment date");
    await user.click(screen.getByRole("button", {name:"Save changes"}));
    await screen.findByRole("alert");
    expect(Boolean(screen.queryByRole("button", {name:"Review related fee dates"}))).toBe(canRecoverOwnerDistribution);
  });
  it("does not expose correction fields without authority", () => { mount({ canCorrectFinance: false }); expect(screen.queryByRole("dialog")).toBeNull(); });
  it("keeps the original visible and saves a contribution edit once with the corrected values", async () => {
    mocks.action.mockResolvedValue({ status: "success" });
    const close = vi.fn();
    const user = userEvent.setup();
    mount({ entry: { ...entry, kind: "contribution" }, onOpenChange: close });
    await user.clear(screen.getByLabelText("Amount (USD)"));
    await user.type(screen.getByLabelText("Amount (USD)"), "25.5");
    await user.clear(screen.getByLabelText("Reference"));
    await user.type(screen.getByLabelText("Reference"), "Corrected reference");
    await user.type(screen.getByLabelText("Reason for correction"), "Correct bank amount");
    expect(screen.getByText(/USD 20.00.*January payout/)).toBeTruthy();
    expect(mocks.action).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mocks.action).toHaveBeenCalledOnce();
    const payload = mocks.action.mock.calls[0][1] as FormData;
    expect(payload.get("amount")).toBe("25.50");
    expect(payload.get("originalId")).toBe(entry.id);
    expect(payload.get("kind")).toBe("contribution");
    expect(payload.get("reference")).toBe("Corrected reference");
    expect(close).toHaveBeenCalledWith(false);
  });
  it.each(["0", "-2", "1.001", "1e2"])("rejects invalid exact amount %s before saving", async amount => {
    const user = userEvent.setup(); mount();
    await user.clear(screen.getByLabelText("Amount (USD)")); await user.type(screen.getByLabelText("Amount (USD)"), amount);
    await user.type(screen.getByLabelText("Reason for correction"), "Correct wrong amount");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert").textContent).toContain("amount greater than zero");
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("rejects unchanged values even with a reason", async () => {
    const user = userEvent.setup(); mount();
    await user.type(screen.getByLabelText("Reason for correction"), "Review same values");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert").textContent).toContain("Change the date, amount, or reference");
  });
  it.each(["2026-02-30", "2999-01-01"])("rejects invalid or future date %s before saving", async date => {
    const user = userEvent.setup(); mount();
    await user.clear(screen.getByLabelText("Correction date")); await user.type(screen.getByLabelText("Correction date"), date);
    await user.type(screen.getByLabelText("Reason for correction"), "Correct payment date");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("keeps edits on a rejected save and reuses the same key only for the same correction", async () => {
    mocks.action.mockImplementation(async () => ({ status: "error", message: "The affected month is closed." }));
    const user = userEvent.setup(); mount();
    await user.clear(screen.getByLabelText("Amount (USD)")); await user.type(screen.getByLabelText("Amount (USD)"), "30");
    await user.type(screen.getByLabelText("Reason for correction"), "Correct bank amount");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain("month is closed");
    expect((screen.getByLabelText("Amount (USD)") as HTMLInputElement).value).toBe("30");
    expect(mocks.action).toHaveBeenCalledOnce();
    const payload = mocks.action.mock.calls[0][1] as FormData;
    expect(payload.get("originalId")).toBe(entry.id);
    expect(payload.get("amount")).toBe("30.00");
    expect(mocks.refresh).not.toHaveBeenCalled();
    const form = screen.getByRole("button", { name: "Save changes" }).closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    expect((mocks.action.mock.calls[1][1] as FormData).get("idempotencyKey")).toBe(payload.get("idempotencyKey"));
    await user.type(screen.getByLabelText("Reference"), " revised");
    await act(async () => { fireEvent.submit(form); });
    expect((mocks.action.mock.calls[2][1] as FormData).get("idempotencyKey")).not.toBe(payload.get("idempotencyKey"));
  });
  it("resets unsaved fields after close and reopen", async () => {
    const user = userEvent.setup(); const view = mount();
    await user.type(screen.getByLabelText("Reference"), " edited");
    view.rerender(<OwnerTransactionCorrectionDialog open={false} onOpenChange={vi.fn()} canCorrectFinance propertyId="property" entry={entry} />);
    view.rerender(<OwnerTransactionCorrectionDialog open onOpenChange={vi.fn()} canCorrectFinance propertyId="property" entry={entry} />);
    expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe("January payout");
  });
});
