import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getCsv } from "@/app/api/reports/export/route";
import { GET as getExcel } from "@/app/api/reports/excel/route";
import { GET as getPdf } from "@/app/api/reports/pdf/route";
import { getReportCsv } from "@/features/reports/data/csv";
import { getReportExcel } from "@/features/reports/data/excel";
import { getReportPdf } from "@/features/reports/data/pdf";
import {
  getAdminMembershipForUser,
  getCurrentUser,
} from "@/lib/auth/context";

vi.mock("@/lib/auth/context", () => ({
  getAdminMembershipForUser: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/features/reports/data/csv", () => ({
  getReportCsv: vi.fn(),
}));

vi.mock("@/features/reports/data/excel", () => ({
  getReportExcel: vi.fn(),
}));

vi.mock("@/features/reports/data/pdf", () => ({
  getReportPdf: vi.fn(),
}));

const handlers = [
  ["CSV", getCsv, getReportCsv, "export"],
  ["Excel", getExcel, getReportExcel, "excel"],
  ["PDF", getPdf, getReportPdf, "pdf"],
] as const;
const unitId = "8b3a08d2-0898-4de3-9495-994eaf7a08dc";
const scopeMessage =
  "Owner Statements are property-level reports. Clear the unit filter to continue.";
const publicationMessage =
  "Owner Statement export is unavailable until opening and closing owner balances are authoritative.";

describe("report export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getAdminMembershipForUser).mockResolvedValue({
      organizationId: "organization-1",
      organizationName: "Demo Org",
    } as never);
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

  it.each(handlers)("returns 403 for non-admin %s export", async (_, handler, __, route) => {
    vi.mocked(getAdminMembershipForUser).mockResolvedValueOnce(null);

    const response = await handler(
      new Request(
        `http://localhost/api/reports/${route}?report=unit-profit-loss&month=2026-07`,
      ),
    );

    expect(response.status).toBe(403);
  });

  it.each(handlers)(
    "returns controlled 400 for unit-scoped Owner Statement %s",
    async (_, handler, loader, route) => {
      const response = await handler(
        new Request(
          `http://localhost/api/reports/${route}?report=owner-statement&month=2026-07&unitId=${unitId}`,
        ),
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toBe(scopeMessage);
      expect(loader).not.toHaveBeenCalled();
    },
  );

  it.each(handlers)(
    "returns the report publication block for %s",
    async (_, handler, loader, route) => {
      vi.mocked(loader).mockResolvedValueOnce({
        validation: {
          code: "owner_statement_balances_unavailable",
          message: publicationMessage,
          status: 409,
        },
      } as never);

      const response = await handler(
        new Request(
          `http://localhost/api/reports/${route}?report=owner-statement&month=2026-07`,
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

  it("keeps CSV as an authenticated compatibility export", async () => {
    vi.mocked(getReportCsv).mockResolvedValue({
      body: "Property,Unit,Income,Expenses,Net income",
      filename: "unit-profit-loss-2026-07-all-properties.csv",
    });

    const response = await getCsv(
      new Request(
        "http://localhost/api/reports/export?report=unit-profit-loss&month=2026-07",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
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
