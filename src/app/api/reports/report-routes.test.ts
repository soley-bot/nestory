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
const propertyId = "52b1ed33-0ac8-4c3d-9d9d-631e9f557014";
const ownerPersonId = "c304facd-1caa-4f98-9d43-cf44f65ac32f";
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

  it("returns controlled 400 when an Owner Statement PDF has no property", async () => {
    vi.mocked(getReportPdf).mockResolvedValue({
      validation: {
        message: "Select one property before generating an Owner Statement PDF.",
        status: 400,
      },
    });

    const response = await getPdf(
      new Request(
        "http://localhost/api/reports/pdf?report=owner-statement&month=2026-07",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      "Select one property before generating an Owner Statement PDF.",
    );
  });

  it("returns controlled 409 when the selected property is blocked", async () => {
    vi.mocked(getReportPdf).mockResolvedValue({
      validation: {
        message:
          "This Owner Statement is not ready. Resolve the property blockers before generating it.",
        status: 409,
      },
    });

    const response = await getPdf(
      new Request(
        `http://localhost/api/reports/pdf?report=owner-statement&month=2026-07&propertyId=${propertyId}`,
      ),
    );

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("not ready");
  });

  it("returns controlled 400 when a multi-owner property has no recipient", async () => {
    vi.mocked(getReportPdf).mockResolvedValue({
      validation: {
        message: "Select an owner recipient before generating this statement.",
        status: 400,
      },
    });

    const response = await getPdf(
      new Request(
        `http://localhost/api/reports/pdf?report=owner-statement&month=2026-07&propertyId=${propertyId}`,
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      "Select an owner recipient before generating this statement.",
    );
  });

  it("returns one recipient PDF for valid property and owner scope", async () => {
    vi.mocked(getReportPdf).mockResolvedValue({
      body: new TextEncoder().encode("owner-specific PDF"),
      filename: "owner-statement-2026-07-p1-owner-one.pdf",
    });

    const response = await getPdf(
      new Request(
        `http://localhost/api/reports/pdf?report=owner-statement&month=2026-07&propertyId=${propertyId}&ownerPersonId=${ownerPersonId}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("owner-specific PDF");
    expect(getReportPdf).toHaveBeenCalledWith(
      "organization-1",
      "Demo Org",
      expect.objectContaining({ ownerPersonId, propertyId }),
    );
  });

  it("returns controlled 400 for a recipient outside the selected property", async () => {
    vi.mocked(getReportPdf).mockResolvedValue({
      validation: {
        message:
          "The selected owner is not a ready recipient for this property and month.",
        status: 400,
      },
    });

    const response = await getPdf(
      new Request(
        `http://localhost/api/reports/pdf?report=owner-statement&month=2026-07&propertyId=${propertyId}&ownerPersonId=bd52e057-ef3c-47fd-971d-41e5b004cb15`,
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("not a ready recipient");
  });
});
