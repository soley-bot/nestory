import { describe, expect, it } from "vitest";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";

const records = [{ id: "first" }, { id: "second" }];

describe("record selection", () => {
  it("keeps an exact requested id as the initial selection", () => {
    expect(getInitialRecordId(records, "missing")).toBe("missing");
  });

  it("falls back to the first record only for normal list views", () => {
    expect(getSelectedRecord({ records, selectedRecordId: "missing" })).toBe(
      records[0],
    );
  });

  it("does not select the first record when an exact link misses", () => {
    expect(
      getSelectedRecord({
        focusedRecordId: "missing",
        records,
        selectedRecordId: "missing",
      }),
    ).toBeNull();
  });

  it("keeps user selection after an exact link misses", () => {
    expect(
      getSelectedRecord({
        focusedRecordId: "missing",
        records,
        selectedRecordId: "second",
      }),
    ).toBe(records[1]);
  });
});
