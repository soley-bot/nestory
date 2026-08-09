import { describe, expect, it } from "vitest";
import {
  formatLedgerSource,
  isLedgerSourceResolved,
  normalizeLedgerSource,
} from "@/features/ledger/data/ledger";

describe("Ledger source presentation", () => {
  it("recognizes atomic receipt projections as Rent & Income evidence", () => {
    expect(normalizeLedgerSource("receipt_allocation")).toBe(
      "receipt_allocation",
    );
    expect(formatLedgerSource("receipt_allocation")).toBe("Rent & Income");
  });

  it("requires both a source id and a recognized source type", () => {
    expect(isLedgerSourceResolved("allocation-1", "receipt_allocation")).toBe(
      true,
    );
    expect(isLedgerSourceResolved("legacy-source", "legacy_unknown")).toBe(
      false,
    );
    expect(isLedgerSourceResolved(null, "receipt_allocation")).toBe(false);
  });
});
