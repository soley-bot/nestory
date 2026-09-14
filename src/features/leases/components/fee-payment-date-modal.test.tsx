/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), preview: vi.fn(), correct: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/leases/fee-payment-date-actions", () => ({ listFeePaymentDateCandidatesAction: mocks.list, previewFeePaymentDateCorrectionAction: mocks.preview, correctFeePaymentDateAction: mocks.correct }));
vi.mock("@/components/ui/date-picker-field", () => ({ DatePickerField: (props: { ariaLabel: string; defaultValue: string; onValueChange: (value: string) => void }) => <input aria-label={props.ariaLabel} defaultValue={props.defaultValue} onChange={(event) => props.onValueChange(event.target.value)} /> }));
vi.mock("@/components/ui/select-control", () => ({ SelectControl: (props: { ariaLabel: string; value: string; options: { value: string; label: string }[]; onValueChange: (value: string) => void }) => <select aria-label={props.ariaLabel} value={props.value} onChange={(event) => props.onValueChange(event.target.value)}>{props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));
import { FeePaymentDateModal } from "./fee-payment-date-modal";

const candidate = { allocationId: "a", invoiceNumber: "INV-1", amount: 48.33, paymentDate: "2026-09-01", feeDate: "2026-09-01" };
const preview = { allocationId: "a", oldDate: candidate.paymentDate, newDate: "2026-09-09", amount: 48.33, canApply: true, blockers: [], previewHash: "a".repeat(64), cashChangeOnEarlierDate: -48.33, currentBalanceChange: 0 };
async function prepare() {
  await screen.findByLabelText("Actual payment date");
  fireEvent.change(screen.getByLabelText("Actual payment date"), { target: { value: preview.newDate } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Actual bank transfer date" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview correction" }));
  await screen.findByRole("button", { name: "Confirm payment date correction" });
}

describe("fee payment date modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ candidates: [candidate, { ...candidate, allocationId: "b", invoiceNumber: "INV-2" }] });
    mocks.preview.mockResolvedValue({ status: "preview", preview });
  });
  afterEach(cleanup);

  it("loads settlements on mount and invalidates a reviewed preview when the date or settlement changes", async () => {
    render(<FeePaymentDateModal leaseId="lease" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await prepare();
    expect(mocks.list).toHaveBeenCalledWith("lease");
    fireEvent.change(screen.getByLabelText("Actual payment date"), { target: { value: "2026-09-10" } });
    expect(screen.queryByRole("button", { name: "Confirm payment date correction" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Actual payment date"), { target: { value: preview.newDate } });
    fireEvent.click(screen.getByRole("button", { name: "Preview correction" }));
    await screen.findByRole("button", { name: "Confirm payment date correction" });
    fireEvent.change(screen.getByLabelText("Fee settlement"), { target: { value: "b" } });
    expect(screen.queryByRole("button", { name: "Confirm payment date correction" })).toBeNull();
  });

  it("retains failed inputs and reuses the idempotency key on a network retry", async () => {
    mocks.correct.mockRejectedValueOnce(new Error("Network")).mockResolvedValueOnce({ status: "success", message: "Corrected" });
    const onSuccess = vi.fn();
    render(<FeePaymentDateModal leaseId="lease" onClose={vi.fn()} onSuccess={onSuccess} />);
    await prepare();
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment date correction" }));
    await screen.findByText(/Retry with the same details/);
    expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("Actual bank transfer date");
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment date correction" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Corrected"));
    expect(mocks.correct.mock.calls[0][0].idempotencyKey).toBe(mocks.correct.mock.calls[1][0].idempotencyKey);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["financial_month_locked", /financial month affected/],
    ["fee_payment_date_would_underfund_owner_cash", /insufficient owner cash/],
    ["fee_payment_date_in_future", /today's business date/],
    ["fee_payment_date_owner_mismatch", /Check the ownership dates/],
    ["fee_payment_allocation_not_correctable", /no longer eligible/],
    ["privileged_email_step_up_required", /Verify this signed-in session by email/],
    ["unexpected_internal_code", /could not be verified for correction/],
  ])("shows an actionable blocker for %s and prevents confirmation", async (code, expected) => {
    mocks.preview.mockResolvedValue({ status: "preview", preview: { ...preview, canApply: false, blockers: [code] } });
    render(<FeePaymentDateModal leaseId="lease" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await prepare();
    expect(screen.getByText(expected)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm payment date correction" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(code)).toBeNull();
  });
});
