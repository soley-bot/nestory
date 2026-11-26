/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FinancialWriteProvider } from "@/lib/finance/financial-write-provider";
import type { FinancialWriteContext } from "@/lib/finance/financial-write-context";

vi.mock("../pilot-rent-posting-actions", () => ({ setPilotRentAutoPostingAction: vi.fn() }));
import { PilotRentPostingSetting } from "./pilot-rent-posting-setting";

const base: FinancialWriteContext = {
  generation: 1, status: "open", enforced: true, financial_start_date: "2026-10-01",
  automatic_rent_enabled: false, automatic_rent_updated_at: "2026-11-25T12:00:00+00:00",
};
afterEach(cleanup);
function show(context: FinancialWriteContext | null) {
  return render(<FinancialWriteProvider context={base} organizationId="pilot"><PilotRentPostingSetting context={context} /></FinancialWriteProvider>);
}
it("shows the confirmed value and an explicit save direction", () => {
  const view = show(base);
  expect(screen.getByText("Automatic rent posting is off.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Turn on automatic rent posting" })).toBeTruthy();
  expect(screen.getByText(/current billing month/i)).toBeTruthy();
  view.rerender(<FinancialWriteProvider context={base} organizationId="pilot"><PilotRentPostingSetting context={{ ...base, automatic_rent_enabled: true }} /></FinancialWriteProvider>);
  expect(screen.getByRole("button", { name: "Turn off automatic rent posting" })).toBeTruthy();
});
it("fails closed when the setting is unavailable or Pilot is frozen", () => {
  const view = show({ ...base, automatic_rent_updated_at: undefined });
  expect(screen.queryByRole("button", { name: /automatic rent posting/i })).toBeNull();
  expect(screen.getByText(/setting is unavailable/i)).toBeTruthy();
  view.rerender(<FinancialWriteProvider context={base} organizationId="pilot"><PilotRentPostingSetting context={{ ...base, status: "frozen" }} /></FinancialWriteProvider>);
  expect(screen.queryByRole("button", { name: /automatic rent posting/i })).toBeNull();
  expect(screen.getByText(/pilot is frozen/i)).toBeTruthy();
});
