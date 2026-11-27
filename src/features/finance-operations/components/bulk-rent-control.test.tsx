// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessDateProvider } from "@/lib/dates/business-date-provider";
import { postBulkRentAction, previewBulkRentAction } from "../actions";
import type { BulkRentSelection, ReadyRent } from "../bulk-rent";
import { BulkRentControl } from "./bulk-rent-control";

vi.mock("../actions", () => ({ previewBulkRentAction: vi.fn(), postBulkRentAction: vi.fn() }));
vi.mock("@/lib/finance/financial-write-provider", () => ({
  useFinancialWriteContext: () => ({ context: { status: "open" }, invalid: false }),
  useFinancialFormData: () => () => { const form = new FormData(); form.set("__financialGeneration","8"); return form; },
}));
const ready: ReadyRent[] = Array.from({ length: 12 }, (_, i) => ({
  leaseId: `00000000-0000-4000-a000-${String(i+1).padStart(12,"0")}`, token: "c".repeat(32),
  property: "River apartments", unit: `Unit ${i+1}`, tenant: `Tenant ${i+1}`, recipient: `Tenant ${i+1}`,
  note: null, status: "ready", rent: 100, fee: 10, currency: "USD",
  from: "2026-10-01", through: i === 11 ? "2026-10-10" : "2026-10-31",
  issueDate: "2026-11-26", prorated: i === 11, route: "through_ips",
}));
beforeEach(() => {
  vi.mocked(previewBulkRentAction).mockResolvedValue({ data: ready });
  vi.mocked(postBulkRentAction).mockImplementation(async (_month, _property, items) => ({
    data: items.map(item => ({ leaseId: item.id, status: "generated", message: "Issued" })),
  }));
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function openReview() {
  render(<BusinessDateProvider businessDate="2026-11-26" timeZone="UTC"><BulkRentControl property={null} /></BusinessDateProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Generate past rent" }));
  await screen.findByText("12 ready to invoice · 0 already invoiced · 0 to review");
}

it("requires an explicit confirmation, sends bounded batches and leaves prorated leases for individual selection", async () => {
  await openReview();
  expect(previewBulkRentAction).toHaveBeenCalledWith("2026-10", null);
  expect((screen.getByRole("button", { name: "Review selected invoices" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Select all 11 full-month leases"));
  fireEvent.click(screen.getByRole("button", { name: "Review selected invoices" }));
  expect(postBulkRentAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Generate 11 invoices" }));
  await screen.findByText("11 generated · 0 already invoiced · 0 to review");
  const calls = vi.mocked(postBulkRentAction).mock.calls;
  expect(calls.map(call => call[2].length)).toEqual([10,1]);
  expect(calls.flatMap(call => call[2].map(item => item.id))).not.toContain(ready[11].leaseId);
  expect(calls.every(([month,property,,form]) => month === "2026-10" && property === null && form.get("__financialGeneration") === "8")).toBe(true);
});

it("opens past rent for the selected lease even when two leases share the same displayed unit number", async () => {
  vi.mocked(previewBulkRentAction).mockResolvedValue({ data: [
    { ...ready[0], unit: "A-01" }, { ...ready[1], unit: "A-01" },
  ] });
  render(<BusinessDateProvider businessDate="2026-11-26" timeZone="UTC">
    <BulkRentControl property="property-1" initialMonth="2026-10" leaseId={ready[1].leaseId} />
  </BusinessDateProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Generate past rent" }));
  await screen.findByText("1 ready to invoice · 0 already invoiced · 0 to review");
  expect(previewBulkRentAction).toHaveBeenCalledWith("2026-10", "property-1");
  expect(screen.queryByLabelText("Select River apartments A-01 Tenant 1")).toBeNull();
  fireEvent.click(screen.getByLabelText("Select River apartments A-01 Tenant 2"));
  fireEvent.click(screen.getByRole("button", { name: "Review selected invoices" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate 1 invoice" }));
  await screen.findByText(/1 generated/);
  expect(vi.mocked(postBulkRentAction).mock.calls[0][2]).toEqual([{ id: ready[1].leaseId, token: ready[1].token }]);
});

it("allows a partial month to be selected individually and directs an uncertain outcome back through review", async () => {
  await openReview();
  fireEvent.click(screen.getByLabelText("Select River apartments Unit 12 Tenant 12"));
  fireEvent.click(screen.getByRole("button", { name: "Review selected invoices" }));
  vi.mocked(postBulkRentAction).mockRejectedValueOnce(new Error("Network interrupted"));
  fireEvent.click(screen.getByRole("button", { name: "Generate 1 invoice" }));
  await screen.findByText(/1 unconfirmed/);
  expect(vi.mocked(postBulkRentAction).mock.calls[0][2]).toEqual([{ id: ready[11].leaseId, token: ready[11].token }] satisfies BulkRentSelection);
  fireEvent.click(screen.getByRole("button", { name: "Review month again" }));
  await waitFor(() => expect(previewBulkRentAction).toHaveBeenCalledTimes(2));
  expect(postBulkRentAction).toHaveBeenCalledTimes(1);
});
