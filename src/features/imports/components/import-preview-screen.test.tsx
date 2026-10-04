/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentImportAction,
  ImportPreviewScreen,
} from "@/features/imports/components/import-preview-screen";
import { autoMapImportHeaders, buildGenericImportPreviewRows } from "@/features/imports/import-config";
import { parseCsv } from "@/features/imports/unit-import";

const actions = vi.hoisted(() => ({
  importReadyRowsAction: vi.fn(),
  commitStagedImportRunAction: vi.fn(),
}));

vi.mock("@/features/imports/actions", () => actions);

beforeEach(() => {
  actions.importReadyRowsAction.mockReset();
  actions.commitStagedImportRunAction.mockReset();
});

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

describe("ImportPreviewScreen", () => {
  it("removes the previous import action while a replacement CSV is being read", async () => {
    const pending = deferred<string>();
    const { container } = renderImport();
    uploadCsv(container, "first.csv", Promise.resolve("Property Code,Property Name\nFIRST,First Home"));
    await screen.findByRole("button", { name: "Import 1 ready row" });
    await act(async () => uploadCsv(container, "replacement.csv", pending.promise));
    expect(screen.queryByRole("button", { name: "Import 1 ready row" })).toBeNull();
    await act(async () => pending.resolve("Property Code,Property Name\nNEW,New Home"));
    expect(screen.getByRole("heading", { name: "replacement.csv" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import 1 ready row" })).toBeTruthy();
  });
  it("keeps the newest file when an older read finishes later", async () => {
    const first = deferred<string>();
    const { container } = renderImport();
    uploadCsv(container, "slow.csv", first.promise);
    uploadCsv(container, "new.csv", Promise.resolve("Property Code,Property Name\nNEW,New Home"));
    await screen.findByRole("heading", { name: "new.csv" });
    await act(async () => first.resolve("Property Code,Property Name\nOLD,Old Home"));
    expect(screen.queryByRole("heading", { name: "slow.csv" })).toBeNull();
    expect(screen.getByRole("heading", { name: "new.csv" })).toBeTruthy();
  });

  it("does not restore a discarded preview after changing import type", async () => {
    const user = userEvent.setup();
    const first = deferred<string>();
    const { container } = renderImport();
    uploadCsv(container, "slow.csv", first.promise);
    await user.click(screen.getByRole("combobox", { name: "Import type" }));
    await user.click(await screen.findByRole("option", { name: "People" }));
    await act(async () => first.resolve("Property Code,Property Name\nOLD,Old Home"));
    expect(screen.queryByRole("heading", { name: "slow.csv" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Import preview rows" })).toBeNull();
    expect(screen.queryByText("slow.csv")).toBeNull();
  });

  it("does not erase the newer file when an older read fails", async () => {
    const first = deferred<string>();
    const { container } = renderImport();
    uploadCsv(container, "slow.csv", first.promise);
    uploadCsv(container, "new.csv", Promise.resolve("Property Code,Property Name\nNEW,New Home"));
    await screen.findByRole("heading", { name: "new.csv" });
    await act(async () => first.reject(new Error("Synthetic read interruption")));
    expect(screen.getByRole("heading", { name: "new.csv" })).toBeTruthy();
    expect(screen.queryByText("The file could not be read.")).toBeNull();
  });

  it("shows a read failure and accepts a replacement file", async () => {
    const { container } = renderImport();
    uploadCsv(container, "broken.csv", Promise.reject(new Error("Synthetic read failure")));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The file could not be read.");
    uploadCsv(container, "new.csv", Promise.resolve("Property Code,Property Name\nNEW,New Home"));
    await screen.findByRole("heading", { name: "new.csv" });
    expect(screen.queryByText("The file could not be read.")).toBeNull();
  });

  it("blocks repeated submissions while saving and after a successful result", async () => {
    const user = userEvent.setup();
    const pending = deferred<Record<string, unknown>>();
    actions.importReadyRowsAction.mockReturnValue(pending.promise);
    const { container } = renderImport();
    uploadCsv(container, "new.csv", Promise.resolve("Property Code,Property Name\nNEW,New Home"));
    const button = await screen.findByRole("button", { name: "Import 1 ready row" });
    await user.click(button);
    const saving = screen.getByRole("button", { name: "Importing ready rows..." });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    await user.click(saving);
    expect(actions.importReadyRowsAction).toHaveBeenCalledOnce();
    const payload = JSON.parse(actions.importReadyRowsAction.mock.calls[0][1].get("payload"));
    await act(async () => pending.resolve({
      draftKey: payload.draftKey, message: "Synthetic import completed.", status: "success", runStatus: "committed",
      commitSummary: { created: 1, updated: 0, failed: 0, skipped: 0 },
    }));
    expect(screen.getByRole("status").textContent).toBe("Synthetic import completed.");
    expect(screen.getByLabelText("Import result counts").textContent).toContain("1 created");
    expect((screen.getByRole("button", { name: "Ready rows imported" }) as HTMLButtonElement).disabled).toBe(true);
    uploadCsv(container, "next.csv", Promise.resolve("Property Code,Property Name\nNEXT,Next Home"));
    await screen.findByRole("heading", { name: "next.csv" });
    expect((screen.getByRole("button", { name: "Import 1 ready row" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Synthetic import completed.")).toBeNull();
  });

  it("retries the staged draft after an actionable failure", async () => {
    const user = userEvent.setup();
    actions.importReadyRowsAction.mockImplementationOnce(async (_state, form: FormData) => ({
      draftKey: JSON.parse(form.get("payload") as string).draftKey,
      message: "Synthetic connection failure. Retry this staged run.", status: "error", runStatus: "staged", runId: "run-1",
    })).mockImplementationOnce(async (_state, form: FormData) => ({
      draftKey: JSON.parse(form.get("payload") as string).draftKey,
      message: "Synthetic retry completed.", status: "success", runStatus: "committed",
    }));
    const { container } = renderImport();
    uploadCsv(container, "new.csv", Promise.resolve("Property Code,Property Name\nNEW,New Home"));
    await user.click(await screen.findByRole("button", { name: "Import 1 ready row" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Synthetic connection failure. Retry this staged run.");
    await user.click(screen.getByRole("button", { name: "Retry 1 ready row" }));
    expect(await screen.findByText("Synthetic retry completed.")).toBeTruthy();
    expect(actions.importReadyRowsAction).toHaveBeenCalledTimes(2);
    expect(actions.importReadyRowsAction.mock.calls[0][1].get("payload")).toBe(actions.importReadyRowsAction.mock.calls[1][1].get("payload"));
  });
  it("shows result counts and correction guidance for a partially saved run", () => {
    renderImport([{ ...importRun("partial-run", "committed_with_errors"), createdCount: 7, updatedCount: 2, failedCount: 1, skippedCount: 2 }]);
    expect(screen.getByText("Completed with issues")).toBeTruthy();
    expect(screen.getByText("7 created · 2 updated · 1 failed · 2 skipped")).toBeTruthy();
    expect(screen.getByText(/keep already saved rows out of the correction file/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(Resume|Reconcile) / })).toBeNull();
  });

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
    const link = await screen.findByRole("link", { name: "Download rows to fix" });
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
    expect(screen.getByText(/Columns you leave unmatched keep saved values/)).toBeTruthy();
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
    expect(screen.getByText(/Match columns/)).toBeTruthy();
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
      label: "Review results before re-uploading",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function uploadCsv(container: HTMLElement, name: string, contents: Promise<string>) {
  const file = new File([], name, { type: "text/csv" });
  Object.defineProperty(file, "text", { value: () => contents });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
}

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
