import { describe, expect, it } from "vitest";

import { buildPropertyCashShadowMaterialStateToken } from "@/features/finance/data/property-cash-shadow-material";

describe("property cash shadow material-state token", () => {
  it("is stable across object key order", () => {
    const first = buildPropertyCashShadowMaterialStateToken({
      propertySummaryInput: {
        ledgerEntries: [{ amount: "10.00", id: "ledger-1" }],
        units: [{ id: "unit-1" }],
      },
      trustedReportInput: {
        documents: [{ id: "document-1" }],
        leases: [{ id: "lease-1" }],
      },
    });
    const second = buildPropertyCashShadowMaterialStateToken({
      trustedReportInput: {
        leases: [{ id: "lease-1" }],
        documents: [{ id: "document-1" }],
      },
      propertySummaryInput: {
        units: [{ id: "unit-1" }],
        ledgerEntries: [{ id: "ledger-1", amount: "10.00" }],
      },
    });

    expect(first).toEqual(second);
  });

  it("changes when any current-path input changes", () => {
    const before = buildPropertyCashShadowMaterialStateToken({
      trustedReportInput: {
        documents: [{ fileName: "before.pdf", id: "document-1" }],
      },
    });
    const after = buildPropertyCashShadowMaterialStateToken({
      trustedReportInput: {
        documents: [{ fileName: "after.pdf", id: "document-1" }],
      },
    });

    expect(after.hash).not.toBe(before.hash);
  });
});
