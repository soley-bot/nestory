/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImportPreviewScreen } from "@/features/imports/components/import-preview-screen";

describe("ImportPreviewScreen", () => {
  it("uses one vertical flow and one ready-row import action", async () => {
    const csv = [
      "Property Code,Property Name",
      "NEW,New Home",
      ",Missing code",
    ].join("\n");
    const file = new File([csv], "properties.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    const { container } = renderImport();

    expect(screen.getByRole("heading", { level: 1, name: "Import" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Import type" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Download properties template" }),
    ).toBeTruthy();
    expect(screen.queryByText("Import center")).toBeNull();
    expect(screen.queryByText("Choose type")).toBeNull();
    expect(screen.queryByText("Import consequence")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save preview/i })).toBeNull();

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });

    expect(await screen.findByText("1 ready, 1 need attention")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Import 1 ready row" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Import preview rows" }),
    ).toBeTruthy();
    expect(screen.getByText(/Column mapping/)).toBeTruthy();
    expect(screen.getByText(/1 blocked/)).toBeTruthy();
  });

  it("keeps past imports collapsed behind one secondary disclosure", () => {
    const { container } = renderImport();
    const details = Array.from(container.querySelectorAll("details")).find(
      (element) => element.textContent?.includes("Past imports"),
    );

    expect(details).toBeTruthy();
    expect(details?.open).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toContain(
      "Past imports",
    );
  });
});

afterEach(cleanup);

function renderImport() {
  return render(
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
}
