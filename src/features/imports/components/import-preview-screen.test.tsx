/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getCurrentImportAction,
  ImportPreviewScreen,
} from "@/features/imports/components/import-preview-screen";
import { autoMapImportHeaders, buildGenericImportPreviewRows } from "@/features/imports/import-config";
import { parseCsv } from "@/features/imports/unit-import";

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

describe("ImportPreviewScreen", () => {
  it.each([
    ["people", "People", "Person ID", "Display Name,Roles,Email,Phone\nShared Tenant,tenant,shared@example.com,"],
    ["leases", "Leases", "Tenant Person ID", "Property Code,Unit no.,Tenant Name,Tenant Email,Start Date,End Date,Monthly Rent,Due Day,Payment Frequency,Term Status,Status\nCTR,12A,Shared Tenant,shared@example.com,2026-01-01,2026-12-31,850,10,Monthly,Active,Active"],
  ] as const)("allows the %s fix template to resolve a shared identity", async (type, label, idHeader, csv) => {
    const user = userEvent.setup();
    const references = {
      leaseOccupancies: [],
      people: ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"].map((id) => ({
        displayName: "Shared Tenant", id, label: "Shared Tenant (shared@example.com)",
        primaryEmail: "shared@example.com", roles: ["tenant"],
      })),
      properties: [{ code: "CTR", id: "property-1", label: "CTR", name: "Central" }],
      units: [{ id: "unit-1", label: "CTR - 12A", propertyCode: "CTR", propertyId: "property-1", unitNumber: "12A" }],
    };
    const { container } = renderImport([], references);
    await user.click(screen.getByRole("combobox", { name: "Import type" }));
    await user.click(await screen.findByRole("option", { name: label }));
    const file = new File([csv], `${type}.csv`, { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    const link = await screen.findByRole("link", { name: "Fix template" });
    const href = link.getAttribute("href")!;
    const repaired = parseCsv(decodeURIComponent(href.slice(href.indexOf(",") + 1)));
    expect(repaired.headers).toContain(idHeader);
    expect(repaired.records[0].raw[idHeader]).toBe("");
    repaired.records[0].raw[idHeader] = references.people[1].id;
    const [row] = buildGenericImportPreviewRows({
      mapping: autoMapImportHeaders(type, repaired.headers),
      records: repaired.records,
      referenceData: references,
      type,
    });
    expect(row.issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(row.normalizedData[type === "people" ? "existingPersonId" : "tenantPersonId"]).toBe(references.people[1].id);
    if (type === "people") {
      for (const field of ["partyType", "legalName", "taxIdentifier", "notes"]) {
        expect(row.normalizedData).not.toHaveProperty(field);
      }
      expect(row.normalizedData.primaryPhone).toBeNull();
      expect(row.issues).toContainEqual(expect.objectContaining({
        level: "warning", message: "Will clear: Phone.",
      }));
    }
  });

  it("shows field-preservation semantics and row-specific mapped blank clears", async () => {
    const user = userEvent.setup();
    const { container } = renderImport([], {
      leaseOccupancies: [], properties: [], units: [],
      people: [{
        displayName: "Company", id: "person-1", label: "Company (company@example.com)",
        primaryEmail: "company@example.com", roles: ["tenant"],
      }],
    });
    await user.click(screen.getByRole("combobox", { name: "Import type" }));
    await user.click(await screen.findByRole("option", { name: "People" }));
    const csv = "Display Name,Roles,Phone,Party Type\nCompany,tenant,,";
    const file = new File([csv], "people.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    const rows = await screen.findByRole("region", { name: "Import preview rows" });
    expect(within(rows).getByText("Will clear: Phone.")).toBeTruthy();
    expect(within(rows).getByText("Blank party type keeps the existing type.")).toBeTruthy();
    expect(screen.getByText(/Unmapped optional fields keep existing values/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import 1 ready row" })).toBeTruthy();
  });

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
  referenceData: Parameters<typeof ImportPreviewScreen>[0]["referenceData"] = {
    leaseOccupancies: [], people: [], properties: [], units: [],
  },
) {
  return render(
    <ImportPreviewScreen
      recentRuns={recentRuns}
      referenceData={referenceData}
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
