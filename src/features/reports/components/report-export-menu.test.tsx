// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReportBatchExportActions, ReportExportMenu } from "./report-export-menu";
import type { ReportsViewQuery } from "../reports.types";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks();});
const query = {report: "unit-profit-loss", month: "2026-10", propertyId: "all", unitId: "all", ownerPersonId: "all", status: "all", peopleArchiveState: "active", peopleView: "relationship"} as ReportsViewQuery;
async function chooseDownload(label = "PDF report") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", {name: "Export"}));
  await user.click(screen.getByRole("menuitem", {name: label}));
}
function mockDownload() {
  const createObjectURL = vi.fn(() => "blob:synthetic-report");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
  const downloaded: {filename: string; href: string}[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded.push({filename: this.download, href: this.href}); });
  return {createObjectURL, revokeObjectURL, downloaded};
}
it("retains the report and explains download rejection with recovery controls", async () => {
  const fetch = vi.fn(async () => new Response("Billing changed. Recheck this report.", {status: 409, headers: {"content-type": "text/plain"}}));
  vi.stubGlobal("fetch", fetch);
  render(<><p>Selected property report</p><ReportExportMenu viewQuery={{report: "unit-profit-loss", month: "2026-10", propertyId: "all", unitId: "all", ownerPersonId: "all", status: "all", peopleArchiveState: "active", peopleView: "relationship"} as ReportsViewQuery} /></>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", {name: "Export"}));
  await user.click(screen.getByRole("menuitem", {name: "PDF report"}));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Billing changed"));
  expect(screen.getByText("Selected property report")).toBeTruthy();
  expect(screen.getByRole("button", {name: "Retry download"})).toBeTruthy();
  expect(screen.getByRole("button", {name: "Recheck report"})).toBeTruthy();
});

it.each([
  ["PDF report", "application/pdf; charset=binary", "report-name.pdf"],
  ["Excel workbook", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "report-name.xlsx"],
])("downloads %s with its response filename and releases the object URL", async (label, contentType, filename) => {
  const download = mockDownload();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("synthetic bytes", {headers: {"content-type": contentType, "content-disposition": `attachment; filename="${filename}"`}})));
  const {unmount} = render(<ReportExportMenu viewQuery={query} />);
  await chooseDownload(label);
  await waitFor(() => expect(download.downloaded).toEqual([{filename, href: "blob:synthetic-report"}]));
  expect(document.querySelector('a[download]')).toBeNull();
  unmount();
  expect(download.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-report");
});

it("rejects a successful response with a different Office MIME type", async () => {
  const download = mockDownload();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not a workbook", {headers: {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}})));
  render(<ReportExportMenu viewQuery={query} />);
  await chooseDownload("Excel workbook");
  expect((await screen.findByRole("alert")).textContent).toContain("Recheck the report");
  expect(download.createObjectURL).not.toHaveBeenCalled();
});

it("aborts a download on unmount and ignores a late response", async () => {
  const download = mockDownload();
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resolve => {finish = resolve;}));
  vi.stubGlobal("fetch", fetch);
  const {unmount} = render(<ReportExportMenu viewQuery={query} />);
  await chooseDownload();
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
  expect(screen.getByRole("button", {name: "Preparing download..."}).matches(":disabled")).toBe(true);
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {finish(new Response("late bytes", {headers: {"content-type": "application/pdf"}}));});
  expect(download.createObjectURL).not.toHaveBeenCalled();
});

it("discards a previous scope's blob while allowing the newly selected report to download", async () => {
  const download = mockDownload();
  let finishBlob!: (blob: Blob) => void;
  const firstResponse = new Response("synthetic", {headers: {"content-type": "application/pdf"}});
  vi.spyOn(firstResponse, "blob").mockImplementation(() => new Promise(resolve => {finishBlob = resolve;}));
  const fetch = vi.fn().mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(new Response("new report", {headers: {"content-type": "application/pdf"}}));
  vi.stubGlobal("fetch", fetch);
  const {rerender} = render(<ReportExportMenu viewQuery={query} />);
  await chooseDownload();
  await waitFor(() => expect(finishBlob).toBeTypeOf("function"));
  rerender(<ReportExportMenu viewQuery={{...query, month: "2026-11"}} />);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {finishBlob(new Blob(["old report"]));});
  expect(download.createObjectURL).not.toHaveBeenCalled();
  await chooseDownload();
  await waitFor(() => expect(download.downloaded).toHaveLength(1));
  expect(fetch.mock.calls[1][0]).toContain("month=2026-11");
});

it("keeps selected unit reports visible when a bundle is rejected and retries the same ZIP format", async () => {
  const download = mockDownload();
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response("Unit A2 billing needs review.", {status: 409, headers: {"content-type": "text/plain"}}))
    .mockResolvedValueOnce(new Response("zip bytes", {headers: {"content-type": "application/zip", "content-disposition": 'attachment; filename="unit-reports.zip"'}}));
  vi.stubGlobal("fetch", fetch);
  render(<><p>Selected units A1 and A2</p><ReportBatchExportActions disabled={false} pdfHref="/api/reports/unit-profit-loss?format=pdf&unitIds=a1&unitIds=a2" excelHref="/api/reports/unit-profit-loss?format=xlsx&unitIds=a1&unitIds=a2" /></>);
  await userEvent.click(screen.getByRole("link", {name: "Download Excel files"}));
  expect((await screen.findByRole("alert")).textContent).toContain("Unit A2 billing needs review.");
  expect(screen.getByText("Selected units A1 and A2")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", {name: "Retry download"}));
  await waitFor(() => expect(download.downloaded).toEqual([{filename: "unit-reports.zip", href: "blob:synthetic-report"}]));
  expect(fetch.mock.calls.map(call => call[0])).toEqual([
    "/api/reports/unit-profit-loss?format=xlsx&unitIds=a1&unitIds=a2",
    "/api/reports/unit-profit-loss?format=xlsx&unitIds=a1&unitIds=a2",
  ]);
});

it("cancels a pending bundle when the selected units change", async () => {
  const download = mockDownload();
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resolve => {finish = resolve;}));
  vi.stubGlobal("fetch", fetch);
  const {rerender} = render(<ReportBatchExportActions disabled={false} pdfHref="/api/reports/unit-profit-loss?format=pdf&unitIds=a1" excelHref="/api/reports/unit-profit-loss?format=xlsx&unitIds=a1" />);
  await userEvent.click(screen.getByRole("link", {name: "Download PDFs"}));
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
  expect(screen.getByRole("button", {name: "Preparing download..."}).matches(":disabled")).toBe(true);
  rerender(<ReportBatchExportActions disabled={false} pdfHref="/api/reports/unit-profit-loss?format=pdf&unitIds=a2" excelHref="/api/reports/unit-profit-loss?format=xlsx&unitIds=a2" />);
  expect(signal.aborted).toBe(true);
  await act(async () => {finish(new Response("old zip", {headers: {"content-type": "application/zip"}}));});
  expect(download.createObjectURL).not.toHaveBeenCalled();
  expect(screen.getByRole("link", {name: "Download PDFs"}).getAttribute("href")).toContain("unitIds=a2");
});
