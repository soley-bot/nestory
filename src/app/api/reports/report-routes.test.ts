import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getCsv } from "@/app/api/reports/export/route";
import { GET as getPdf } from "@/app/api/reports/pdf/route";
import { getReportCsv } from "@/features/reports/data/csv";
import { getReportPdf } from "@/features/reports/data/pdf";

vi.mock("@/lib/auth/context", () => ({
  getAdminMembershipForUser: vi.fn().mockResolvedValue({
    organizationId: "organization-1",
    organizationName: "Demo Org",
  }),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" }),
}));

vi.mock("@/features/reports/data/csv", () => ({
  getReportCsv: vi.fn(),
}));

vi.mock("@/features/reports/data/pdf", () => ({
  getReportPdf: vi.fn(),
}));

const unitId = "8b3a08d2-0898-4de3-9495-994eaf7a08dc";
const message =
  "Owner Statements are property-level reports. Clear the unit filter to continue.";

describe("Owner Statement export scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["CSV", getCsv, getReportCsv, "export"],
    ["PDF", getPdf, getReportPdf, "pdf"],
  ] as const)(
    "returns controlled 400 for unit-scoped %s",
    async (_, handler, loader, route) => {
      const response = await handler(
        new Request(
          `http://localhost/api/reports/${route}?report=owner-statement&month=2026-07&unitId=${unitId}`,
        ),
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toBe(message);
      expect(loader).not.toHaveBeenCalled();
    },
  );

  it("returns a successful CSV response containing a property blocker", async () => {
    vi.mocked(getReportCsv).mockResolvedValue({
      body: "Blocked,Deposit reversal deposit-reversal-b is missing its original event type",
      filename: "owner-statement-2026-07-all-properties.csv",
    });

    const response = await getCsv(
      new Request(
        "http://localhost/api/reports/export?report=owner-statement&month=2026-07",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("deposit-reversal-b");
  });

  it("returns a successful PDF response containing a property blocker", async () => {
    vi.mocked(getReportPdf).mockResolvedValue({
      body: new TextEncoder().encode(
        "Deposit reversal deposit-reversal-b is missing its original event type",
      ),
      filename: "owner-statement-2026-07-all-properties.pdf",
    });

    const response = await getPdf(
      new Request(
        "http://localhost/api/reports/pdf?report=owner-statement&month=2026-07",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("deposit-reversal-b");
  });
});
