import { describe, expect, it } from "vitest";
import {
  formatLedgerSource,
  normalizeLedgerSource,
} from "@/features/ledger/data/ledger";

describe("Ledger source presentation", () => {
  it("recognizes atomic receipt projections as Rent & Income evidence", () => {
    expect(normalizeLedgerSource("receipt_allocation")).toBe(
      "receipt_allocation",
    );
    expect(formatLedgerSource("receipt_allocation")).toBe("Rent & Income");
  });
});
