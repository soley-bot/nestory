import { describe, expect, it } from "vitest";

import {
  categoryLabel,
  expenseStatusPresentation,
  formatEvidenceSize,
  getInvoiceStatusPresentation,
  getRentGenerationLabel,
  maintenanceStatusLabel,
} from "./finance-operations-view-model";

describe("finance operations presentation model", () => {
  it("normalizes compact operational labels without leaking storage syntax", () => {
    expect(formatEvidenceSize(640)).toBe("640 bytes");
    expect(formatEvidenceSize(2_560)).toBe("2.5 KB");
    expect(maintenanceStatusLabel("ready_for_review")).toBe("Ready For Review");
    expect(categoryLabel("repairs_maintenance")).toBe(
      "Repairs and Maintenance",
    );
  });

  it("maps expense states to the label and semantic tone used by the table", () => {
    expect(expenseStatusPresentation("submitted")).toEqual({
      label: "Awaiting approval",
      tone: "warning",
    });
    expect(expenseStatusPresentation("rejected")).toEqual({
      label: "Rejected",
      tone: "danger",
    });
  });

  it("distinguishes late payment and overdue balances using an explicit business date", () => {
    expect(
      getInvoiceStatusPresentation({
        businessDate: "2026-08-14",
        dueDate: "2026-08-05",
        settlements: [{ date: "2026-08-08", isReversed: false }],
        status: "paid",
      }),
    ).toEqual({ label: "Paid late", tone: "success" });
    expect(
      getInvoiceStatusPresentation({
        businessDate: "2026-08-14",
        dueDate: "2026-08-05",
        settlements: [],
        status: "partly_paid",
      }),
    ).toEqual({ label: "Partly paid · overdue", tone: "warning" });
  });

  it("labels automatic and recovery invoice sources for operators", () => {
    expect(getRentGenerationLabel("manual_recovery")).toBe(
      "Recovered by Super Admin",
    );
    expect(getRentGenerationLabel("scheduled")).toBe(
      "Generated automatically",
    );
    expect(getRentGenerationLabel(null)).toBe("Existing invoice");
  });
});
