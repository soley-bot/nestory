/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
const { refresh, lock } = vi.hoisted(() => ({ refresh: vi.fn(), lock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/ledger/actions", () => ({ setLedgerPeriodLockAction: lock }));
import { LockReportMonth, ReportActionForm, ReportRemediation } from "./report-remediation-controls";
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("report remediation", () => {
  it("retains the same retry key across refresh but gives changed input a new command", async () => {
    const action = vi.fn().mockRejectedValue(new Error("unknown outcome"));
    const content = (key: string) => <ReportActionForm action={action}><input type="hidden" name="idempotencyKey" value={key} /><input aria-label="Reason" name="reason" defaultValue="first" /><button>Save</button></ReportActionForm>;
    const { rerender } = render(content("server-key-one"));
    const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    submit(); await screen.findByRole("alert");
    const firstKey = action.mock.calls[0][0].get("idempotencyKey");
    rerender(content("server-key-after-refresh"));
    submit(); await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert");
    expect(action.mock.calls[1][0].get("idempotencyKey")).toBe(firstKey);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "different" } });
    submit(); await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    await screen.findByRole("alert");
    expect(action.mock.calls[2][0].get("idempotencyKey")).not.toBe(firstKey);
  });

  it("requires an explicit new correction after success and uses a fresh key for it", async () => {
    const action = vi.fn().mockResolvedValue({ status: "success" });
    render(<ReportActionForm action={action} newCommandLabel="Record another correction"><input name="idempotencyKey" type="hidden" value="initial-key" /><input name="amount" defaultValue="25" /><button>Save</button></ReportActionForm>);
    const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    submit(); await screen.findByText(/Saved/);
    submit(); expect(action).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Record another correction" }));
    submit(); await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1][0].get("idempotencyKey")).not.toBe(action.mock.calls[0][0].get("idempotencyKey"));
  });

  it("preserves a cancelled draft and submits only the selected company month with an explicit reason", async () => {
    lock.mockResolvedValue({ status: "success" });
    const user = userEvent.setup();
    render(<LockReportMonth month="2026-08" />);
    await user.click(screen.getByRole("button", { name: "Lock financial month" }));
    expect(screen.getByText(/entire company/)).toBeTruthy();
    await user.type(screen.getByLabelText("Lock reason"), "August review complete");
    await user.click(screen.getByRole("button", { name: "Back to report" }));
    expect(lock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Lock financial month" }));
    expect((screen.getByLabelText("Lock reason") as HTMLInputElement).value).toBe("August review complete");
    await user.click(screen.getByRole("button", { name: "Lock 2026-08" }));
    await waitFor(() => expect(lock).toHaveBeenCalledOnce());
    expect(Object.fromEntries(lock.mock.calls[0][1])).toEqual({ periodStart: "2026-08", lockState: "locked", reason: "August review complete" });
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps validation errors and field values without claiming success", async () => {
    const action = vi.fn().mockResolvedValue({ status: "error", fieldErrors: { reason: ["Enter a reason."] } });
    render(<ReportActionForm action={action}><input aria-label="Reason" name="reason" defaultValue="draft" /><button>Save</button></ReportActionForm>);
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await screen.findByText("Enter a reason.");
    expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("draft");
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Recheck" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("prevents duplicate pending commands and handles an unconfirmed result honestly", async () => {
    let reject!: (reason: Error) => void;
    const action = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    render(<ReportRemediation label="Resolve"><ReportActionForm action={action}><input name="reason" defaultValue="keep" /><button>Save</button></ReportActionForm></ReportRemediation>);
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    const form = screen.getByRole("button", { name: "Save" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByText("Saving…")).toBeTruthy();
    reject(new Error("internal database detail"));
    await screen.findByText(/update could not be confirmed/);
    expect(screen.queryByText("internal database detail")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
