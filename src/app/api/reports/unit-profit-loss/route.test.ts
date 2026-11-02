import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { getCurrentUser, getFinanceReportMembershipForUser } from "@/lib/auth/context";
import { getUnitProfitLossBundle } from "@/features/reports/data/unit-profit-loss-bundle";
import { withFinancialDownloadContext } from "@/lib/finance/financial-write-context.server";

vi.mock("@/lib/auth/context", () => ({ getCurrentUser: vi.fn(), getFinanceReportMembershipForUser: vi.fn() }));
vi.mock("@/features/reports/data/unit-profit-loss-bundle", () => ({ getUnitProfitLossBundle: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ withFinancialDownloadContext: vi.fn() }));

const unit = (number = 1) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const request = (query = `month=2026-11&format=pdf&unitIds=${unit()}&financialGeneration=3`) => new Request(`http://localhost/api/reports/unit-profit-loss?${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user" } as never);
  vi.mocked(getFinanceReportMembershipForUser).mockResolvedValue({ organizationId: "org", organizationName: "Example" } as never);
  vi.mocked(withFinancialDownloadContext).mockImplementation(async (_org, _request, read) => read());
  vi.mocked(getUnitProfitLossBundle).mockResolvedValue({ body: new Uint8Array([80, 75, 3, 4]), filename: "unit-profit-loss-2026-11-pdf.zip" });
});

describe("separate unit report download", () => {
  it.each([401, 403])("requires reporting authority (%i)", async status => {
    if (status === 401) vi.mocked(getCurrentUser).mockResolvedValue(null);
    else vi.mocked(getFinanceReportMembershipForUser).mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(getUnitProfitLossBundle).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each([
    "month=2026-13&format=pdf&unitIds=" + unit(),
    "month=2026-11&format=csv&unitIds=" + unit(),
    "month=2026-11&format=pdf",
    "month=2026-11&format=pdf&unitIds=all",
    `month=2026-11&format=pdf&propertyId=bad&unitIds=${unit()}`,
    `month=2026-11&format=pdf&unitIds=${unit()}&unitIds=${unit()}`,
    `month=2026-11&month=2026-10&format=pdf&unitIds=${unit()}`,
    `month=2026-11&format=pdf&unitIds=${unit()}&financialGeneration=1&financialGeneration=2`,
    `month=2026-11&format=pdf&${Array.from({ length: 21 }, (_, index) => `unitIds=${unit(index + 1)}`).join("&")}`,
  ])("rejects ambiguous, invalid or excessive selection: %s", async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(getUnitProfitLossBundle).not.toHaveBeenCalled();
  });

  it("downloads one private ZIP under the original financial generation", async () => {
    const source = request();
    const response = await GET(source);
    expect(response.status).toBe(200);
    expect(withFinancialDownloadContext).toHaveBeenCalledWith("org", source, expect.any(Function));
    expect(getUnitProfitLossBundle).toHaveBeenCalledWith("org", "Example", { month: "2026-11", propertyId: "all", format: "pdf", unitIds: [unit()] });
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Disposition")).toContain("unit-profit-loss-2026-11-pdf.zip");
  });

  it("does not send a ZIP when revision verification fails after generation", async () => {
    vi.mocked(withFinancialDownloadContext).mockImplementation(async (_org, _request, read) => { await read(); throw new Error("source revision changed"); });
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });

  it("preserves an incomplete billing refusal", async () => {
    vi.mocked(getUnitProfitLossBundle).mockResolvedValue({ validation: { code: "monthly_rent_incomplete", status: 409, message: "Monthly billing needs review." } });
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Monthly billing needs review.");
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });
});
