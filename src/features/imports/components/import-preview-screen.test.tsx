/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ImportPreviewScreen,
  summarizeImportConsequences,
} from "@/features/imports/components/import-preview-screen";
import type { GenericImportPreviewRow } from "@/features/imports/import.types";

describe("ImportPreviewScreen consequences", () => {
  it("separates create, update, upsert, and skipped rows before commit", () => {
    const consequence = summarizeImportConsequences([
      makeRow("Create"),
      makeRow("Update"),
      makeRow("Create or update"),
      makeRow("Needs review", true),
    ]);

    expect(consequence).toEqual({
      create: 1,
      createOrUpdate: 1,
      skip: 1,
      update: 1,
    });
  });

  it("renders the exact ready and skipped write counts beside commit", async () => {
    const csv = [
      "Property Code,Property Name",
      "NEW,New Home",
      ",Missing code",
    ].join("\n");
    const file = new File([csv], "properties.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    const { container } = render(
      <ImportPreviewScreen
        recentRuns={[]}
        referenceData={{
          leaseOccupancies: [],
          people: [],
          properties: [],
          units: [],
        }}
        savedMappings={[]}
      />,
    );
    const input = container.querySelector('input[type="file"]');

    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });

    const consequence = await screen.findByRole("region", {
      name: "Import consequence",
    });
    expect(consequence.textContent).toContain("Create1");
    expect(consequence.textContent).toContain("Update0");
    expect(consequence.textContent).toContain("Skip1");
  });
});

afterEach(cleanup);

function makeRow(
  actionLabel: GenericImportPreviewRow["actionLabel"],
  blocked = false,
): GenericImportPreviewRow {
  return {
    actionLabel,
    amountLabel: "-",
    issues: blocked
      ? [{ level: "error", message: "Missing required relationship." }]
      : [],
    normalizedData: {},
    primaryLabel: "Record",
    raw: {},
    secondaryLabel: "",
    sourceRowNumber: 2,
    statusLabel: blocked ? "Blocked" : "Ready",
    targetLabel: "Properties",
  };
}
