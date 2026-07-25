/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ImportPreviewScreen,
  summarizeImportConsequences,
} from "@/features/imports/components/import-preview-screen";
import type {
  GenericImportPreviewRow,
  ImportReferenceData,
} from "@/features/imports/import.types";

const emptyReferenceData: ImportReferenceData = {
  leaseOccupancies: [],
  people: [],
  properties: [],
  units: [],
};

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

  it("keeps pre-upload guidance limited to the active step and file requirement", () => {
    renderImportScreen();

    expect(
      screen.queryByText(
        "Bring portfolio spreadsheets into Nestory with templates, column matching, row checks, and a preview before committing.",
      ),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Match columns" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Preview rows" })).toBeNull();
    expect(screen.queryByText("Import ready")).toBeNull();
    expect(
      screen.queryByText("Start here when the workspace is blank."),
    ).toBeNull();
    expect(
      screen.queryByText("Import tenants, owners, vendors, and staff before leases."),
    ).toBeNull();
    expect(
      screen.getByText("CSV only. Use the properties template when possible."),
    ).toBeTruthy();
    expect(screen.getByText("Upload file")).toBeTruthy();
  });

  it("shows a precise prerequisite only when the selected import type is blocked", () => {
    renderImportScreen();

    fireEvent.click(screen.getByRole("button", { name: /^Units/ }));

    expect(
      screen.getByRole("heading", { name: "Units import requires setup" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Import or add at least one property before units."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Add property" }).getAttribute("href"),
    ).toBe("/properties?action=create");
  });

  it("renders the exact ready and skipped write counts beside commit", async () => {
    const csv = [
      "Property Code,Property Name",
      "NEW,New Home",
      ",Missing code",
    ].join("\n");
    const file = new File([csv], "properties.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    const { container } = renderImportScreen();
    const input = container.querySelector('input[type="file"]');

    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected the import file input.");
    }
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByRole("heading", { name: "Match columns" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Preview rows" })).toBeTruthy();
    expect(screen.queryByText("Upload a CSV first.")).toBeNull();
    expect(
      screen.queryByText(
        "Review the rows first. Save a preview, then import the ready rows.",
      ),
    ).toBeNull();

    const consequence = await screen.findByRole("region", {
      name: "Import consequence",
    });
    expect(consequence.textContent).toContain("Create1");
    expect(consequence.textContent).toContain("Update0");
    expect(consequence.textContent).toContain("Skip1");

    const cleanupQueue = screen.getByRole("region", {
      name: "Import cleanup queue",
    });
    expect(within(cleanupQueue).getByText("Blocked")).toBeTruthy();
  });
});

afterEach(cleanup);

function renderImportScreen(
  referenceData: ImportReferenceData = emptyReferenceData,
) {
  return render(
    <ImportPreviewScreen
      recentRuns={[]}
      referenceData={referenceData}
      savedMappings={[]}
    />,
  );
}

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
