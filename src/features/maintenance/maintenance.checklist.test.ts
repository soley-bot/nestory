import { describe, expect, it } from "vitest";
import {
  formatMaintenanceChecklistText,
  parseMaintenanceChecklistText,
  parseMaintenanceChecklistValue,
} from "@/features/maintenance/maintenance.checklist";

describe("maintenance checklist helpers", () => {
  it("keeps checked and unchecked checklist items in the form payload", () => {
    const items = parseMaintenanceChecklistText(
      "[x] Lock returned\n[ ] Photo uploaded\nPlain note",
    );

    expect(items).toEqual([
      { completed: true, id: "1", label: "Lock returned" },
      { completed: false, id: "2", label: "Photo uploaded" },
      { completed: false, id: "3", label: "Plain note" },
    ]);
    expect(formatMaintenanceChecklistText(items)).toBe(
      "[x] Lock returned\n[ ] Photo uploaded\n[ ] Plain note",
    );
  });

  it("reads stored JSON checklist rows", () => {
    expect(
      parseMaintenanceChecklistValue([
        "Call tenant",
        { completed: true, id: "done", label: "Invoice attached" },
        { label: "  " },
      ]),
    ).toEqual([
      { completed: false, id: "1", label: "Call tenant" },
      { completed: true, id: "done", label: "Invoice attached" },
    ]);
  });
});
