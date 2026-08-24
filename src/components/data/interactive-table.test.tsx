import { describe, expect, it } from "vitest";
import {
  previewRowClassName,
  registerRowClassName,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";

describe("interactive table contract", () => {
  it("separates passive register rows from selectable quick-view rows", () => {
    expect(registerRowClassName).toContain(
      "hover:bg-[var(--table-row-hover)]",
    );
    expect(registerRowClassName).not.toContain("cursor-pointer");
    expect(previewRowClassName).toContain("cursor-pointer");
    expect(previewRowClassName).toContain("focus-visible:outline");
    expect(selectedPreviewRowClassName).toContain(
      "table-row-selected-indicator",
    );
  });
});
