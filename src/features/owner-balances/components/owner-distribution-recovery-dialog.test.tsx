// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), confirm: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../owner-distribution-recovery-actions", () => ({ previewOwnerDistributionRecoveryAction: mocks.preview, confirmOwnerDistributionRecoveryAction: mocks.confirm }));
vi.mock("@/components/ui/date-picker-field", () => ({ DatePickerField: ({ ariaLabel, name, defaultValue, onValueChange }: { ariaLabel: string; name: string; defaultValue: string; onValueChange: (value: string) => void }) => <input name={name} aria-label={ariaLabel} defaultValue={defaultValue} onChange={event => onValueChange(event.target.value)} /> }));
import { OwnerDistributionRecoveryDialog } from "./owner-distribution-recovery-dialog";
const preview = { allocationId: "allocation", withdrawalId: "withdrawal", oldDate: "2026-08-06", newDate: "2026-09-04", oldDistributionDate: "2026-09-15", newDistributionDate: "2026-08-31", amount: 40, distributionAmount: 454.4, currentBalanceChange: 0, previewHash: "a".repeat(64), canApply: true, blockers: [] };
function mount() { return render(<OwnerDistributionRecoveryDialog open onOpenChange={vi.fn()} withdrawalId="withdrawal" distributionDate="2026-08-31" onSuccess={vi.fn()} />); }
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("related date recovery review", () => {
  it("requires an explicit fee date and displays both changes without saving", async () => {
    mocks.preview.mockResolvedValue({ status: "success", preview }); const user = userEvent.setup(); mount();
    expect(screen.queryByRole("button", { name: "Confirm both corrections" })).toBeNull();
    await user.type(screen.getByLabelText("Correct fee payment date"), "2026-09-04");
    await user.click(screen.getByRole("button", { name: "Preview both changes" }));
    const table = await screen.findByRole("table", { name: "Related date correction review" });
    expect(within(table).getByText("06 Aug 2026")).toBeTruthy();
    expect(within(table).getByText("04 Sep 2026")).toBeTruthy();
    expect(within(table).getByText("USD 454.40")).toBeTruthy();
    expect(mocks.confirm).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Correct fee payment date"));
    await user.type(screen.getByLabelText("Correct fee payment date"), "2026-09-05");
    expect(screen.queryByRole("button", { name: "Confirm both corrections" })).toBeNull();
  });
  it("does not expose raw database blockers or confirmation for blocked preview", async () => {
    mocks.preview.mockResolvedValue({ status: "error", message: "An affected financial month is closed.", preview: { ...preview, canApply: false, blockers: ["owner_cash_internal_uuid_detail"] } });
    const user = userEvent.setup(); mount();
    await user.type(screen.getByLabelText("Correct fee payment date"), "2026-09-04"); await user.click(screen.getByRole("button", { name: "Preview both changes" }));
    expect((await screen.findAllByRole("alert"))[0].textContent).toContain("month is closed");
    expect(screen.queryByText(/owner_cash_internal/)).toBeNull(); expect(screen.queryByRole("button", { name: "Confirm both corrections" })).toBeNull();
  });
});
