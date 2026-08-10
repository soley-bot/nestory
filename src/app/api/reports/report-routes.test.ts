import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getExcel } from "@/app/api/reports/excel/route";
import { GET as getPdf } from "@/app/api/reports/pdf/route";
import { getReportExcel } from "@/features/reports/data/excel";
import { getReportPdf } from "@/features/reports/data/pdf";
import { downloadOwnerStatementArtifact } from "@/features/reports/data/owner-statement-artifacts";
import {
  getCurrentUser,
  getFinanceReportMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/auth/context", () => ({
  getCurrentUser: vi.fn(),
  getFinanceReportMembershipForUser: vi.fn(),
}));

vi.mock("@/features/reports/data/excel", () => ({
  getReportExcel: vi.fn(),
}));

vi.mock("@/features/reports/data/pdf", () => ({
  getReportPdf: vi.fn(),
}));

vi.mock("@/features/reports/data/owner-statement-artifacts", () => ({
  downloadOwnerStatementArtifact: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const handlers = [
  ["Excel", getExcel, getReportExcel, "excel"],
  ["PDF", getPdf, getReportPdf, "pdf"],
] as const;
const publicationMessage =
  "Report data is not available for export.";

describe("report export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getFinanceReportMembershipForUser).mockResolvedValue({
      organizationId: "organization-1",
      organizationName: "Demo Org",
    } as never);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  });

  it.each(handlers)("returns 401 for anonymous %s export", async (_, handler, __, route) => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await handler(
      new Request(
        `http://localhost/api/reports/${route}?report=unit-profit-loss&month=2026-07`,
      ),
    );

    expect(response.status).toBe(401);
  });

  it.each(handlers)("returns 403 without report capability for %s export", async (_, handler, __, route) => {
    vi.mocked(getFinanceReportMembershipForUser).mockResolvedValueOnce(null);

    const response = await handler(
      new Request(
        `http://localhost/api/reports/${route}?report=unit-profit-loss&month=2026-07`,
      ),
    );

    expect(response.status).toBe(403);
  });

  it.each([
    ["PDF", getPdf, "pdf", "application/pdf"],
    [
      "Excel",
      getExcel,
      "xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  ] as const)("downloads only the retained verified official %s artifact", async (
    _, handler, format, contentType,
  ) => {
    const bytes = format === "pdf"
      ? new Uint8Array([37, 80, 68, 70])
      : new Uint8Array([80, 75, 3, 4]);
    vi.mocked(downloadOwnerStatementArtifact).mockResolvedValueOnce({
      bytes,
      contentType,
      filename: `owner-statement-OS-202608-000000000000.${format}`,
      format,
    });

    const response = await handler(new Request(
      `http://localhost/api/reports/${format === "pdf" ? "pdf" : "excel"}` +
      "?artifactId=00000000-0000-4000-8000-000000000009",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(contentType);
    expect(downloadOwnerStatementArtifact).toHaveBeenCalledWith(
      expect.anything(),
      "organization-1",
      "00000000-0000-4000-8000-000000000009",
    );
    expect(format === "pdf" ? getReportPdf : getReportExcel).not.toHaveBeenCalled();
  });

  it.each(handlers)("authorizes Finance Manager %s exports through the report-capability helper", async (_, handler, loader, route) => {
    vi.mocked(loader).mockResolvedValueOnce(
      route === "pdf"
        ? { body: new Uint8Array([37, 80, 68, 70]), filename: "report.pdf" }
        : { body: new Uint8Array([80, 75, 3, 4]), filename: "report.xlsx" } as never,
    );

    const response = await handler(new Request(
      `http://localhost/api/reports/${route}?report=unit-profit-loss&month=2026-07`,
    ));

    expect(response.status).toBe(200);
    expect(getFinanceReportMembershipForUser).toHaveBeenCalledWith("user-1");
  });

  it.each(handlers)(
    "returns the report publication block for %s",
    async (_, handler, loader, route) => {
      vi.mocked(loader).mockResolvedValueOnce({
        validation: {
          code: "report_data_unavailable",
          message: publicationMessage,
          status: 409,
        },
      } as never);

      const response = await handler(
        new Request(
          `http://localhost/api/reports/${route}?report=monthly-owner-activity&month=2026-07`,
        ),
      );

      expect(response.status).toBe(409);
      expect(await response.text()).toBe(publicationMessage);
    },
  );

  it("returns a real Excel attachment", async () => {
    vi.mocked(getReportExcel).mockResolvedValue({
      body: new Uint8Array([80, 75, 3, 4]),
      filename: "unit-profit-loss-2026-07-all-properties.xlsx",
    });

    const response = await getExcel(
      new Request(
        "http://localhost/api/reports/excel?report=unit-profit-loss&month=2026-07",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toContain(".xlsx");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      80, 75, 3, 4,
    ]);
  });

  it("has no CSV export route", () => {
    expect(
      existsSync(join(process.cwd(), "src/app/api/reports/export/route.ts")),
    ).toBe(false);
  });

  it("returns a PDF attachment", async () => {
    vi.mocked(getReportPdf).mockResolvedValue({
      body: new Uint8Array([37, 80, 68, 70]),
      filename: "unit-profit-loss-2026-07-all-properties.pdf",
    });

    const response = await getPdf(
      new Request(
        "http://localhost/api/reports/pdf?report=unit-profit-loss&month=2026-07",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
  });
});
