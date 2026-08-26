/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentImportAction,
  ImportPreviewScreen,
} from "@/features/imports/components/import-preview-screen";

describe("ImportPreviewScreen", () => {
  it("rejects an oversized CSV before reading it into browser memory", async () => {
    const file = new File(["Property Code\nCTR"], "oversized.csv", {
      type: "text/csv",
    });
    const readText = vi.fn(async () => "Property Code\nCTR");
    Object.defineProperty(file, "size", { value: (12 * 1024 * 1024) + 1 });
    Object.defineProperty(file, "text", { value: readText });
    const { container } = renderImport();
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input!, { target: { files: [file] } });

    expect(
      await screen.findByText("CSV files must be 12 MB or smaller."),
    ).toBeTruthy();
    expect(readText).not.toHaveBeenCalled();
  });

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

  it("offers resume and reconcile controls for non-terminal past runs", () => {
    renderImport([
      importRun("staged-run", "staged"),
      importRun("committing-run", "committing"),
      importRun("committed-run", "committed"),
      importRun("failed-run", "failed"),
    ]);

    expect(screen.getByRole("button", { name: "Resume import.csv" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Reconcile import.csv" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /^(Resume|Reconcile) / }),
    ).toHaveLength(2);
  });

  it("does not offer Resume for an all-blocked staged run", () => {
    const blocked = importRun("blocked-run", "staged");
    blocked.blockedRows = 1;
    blocked.readyRows = 0;

    renderImport([blocked]);

    expect(screen.queryByRole("button", { name: "Resume import.csv" })).toBeNull();
    expect(
      screen.getByText("Fix references, then re-upload to create a fresh run."),
    ).toBeTruthy();
  });

  it("disables a recovered terminal upload instead of offering Retry", () => {
    expect(
      getCurrentImportAction({
        draftKey: "draft-1",
        readyCount: 3,
        state: {
          draftKey: "draft-1",
          runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
          runStatus: "failed",
          status: "error",
        },
      }),
    ).toEqual({
      blocksSubmission: true,
      label: "Terminal result — re-upload CSV",
      mode: "terminal",
    });

    expect(
      getCurrentImportAction({
        draftKey: "draft-1",
        readyCount: 3,
        state: {
          draftKey: "draft-1",
          runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
          runStatus: "staged",
          status: "error",
        },
      }),
    ).toMatchObject({
      blocksSubmission: false,
      label: "Retry 3 ready rows",
      mode: "retry",
    });
  });
});

afterEach(cleanup);

function renderImport(
  recentRuns: Parameters<typeof ImportPreviewScreen>[0]["recentRuns"] = [],
) {
  return render(
    <ImportPreviewScreen
      recentRuns={recentRuns}
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

function importRun(
  id: string,
  status: Parameters<typeof ImportPreviewScreen>[0]["recentRuns"][number]["status"],
): Parameters<typeof ImportPreviewScreen>[0]["recentRuns"][number] {
  return {
    blockedRows: 0,
    committedAt: null,
    createdAt: "2026-07-31T00:00:00.000Z",
    createdCount: 0,
    failedCount: 0,
    fileName: "import.csv",
    id,
    importType: "properties",
    readyRows: 1,
    skippedCount: 0,
    status,
    totalRows: 1,
    updatedCount: 0,
    warningRows: 0,
  };
}
