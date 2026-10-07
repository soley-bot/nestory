import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as excel } from "@/app/api/reports/excel/route";
import { GET as pdf } from "@/app/api/reports/pdf/route";
import { getReportExcel } from "@/features/reports/data/excel";
import { getReportPdf } from "@/features/reports/data/pdf";
import { downloadOwnerStatementArtifact } from "@/features/reports/data/owner-statement-artifacts";
import { getCurrentUser, getFinanceReportMembershipForUser, getOwnerStatementMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/auth/context", () => ({ getCurrentUser: vi.fn(), getFinanceReportMembershipForUser: vi.fn(), getOwnerStatementMembershipForUser: vi.fn() }));
vi.mock("@/features/reports/data/excel", () => ({ getReportExcel: vi.fn() }));
vi.mock("@/features/reports/data/pdf", () => ({ getReportPdf: vi.fn() }));
vi.mock("@/features/reports/data/owner-statement-artifacts", () => ({ downloadOwnerStatementArtifact: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/observability/capture-unexpected-server-error", () => ({ captureUnexpectedServerError: vi.fn() }));

const handlers = [["excel", excel, getReportExcel], ["pdf", pdf, getReportPdf]] as const;

describe("restricted export boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "synthetic-user-a" } as never);
    vi.mocked(getFinanceReportMembershipForUser).mockResolvedValue(null);
    vi.mocked(getOwnerStatementMembershipForUser).mockResolvedValue(null);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
  });

  it.each(handlers)("%s rejects a guessed artifact ID before accessing storage", async (route, handler) => {
    const response = await handler(new Request(`http://localhost/api/reports/${route}?artifactId=00000000-0000-4000-8000-000000000099&organizationId=company-b`));
    expect(response.status).toBe(403);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(downloadOwnerStatementArtifact).not.toHaveBeenCalled();
    expect(getReportExcel).not.toHaveBeenCalled();
    expect(getReportPdf).not.toHaveBeenCalled();
  });

  it.each(handlers)("%s rejects unauthorized export before loading records", async (route, handler) => {
    const response = await handler(new Request(`http://localhost/api/reports/${route}?report=unit-profit-loss&month=2026-07&propertyId=00000000-0000-4000-8000-000000000099&organizationId=company-b&branchId=branch-b`));
    expect(response.status).toBe(403);
    expect(getReportExcel).not.toHaveBeenCalled();
    expect(getReportPdf).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each(handlers)("%s takes company authority from membership despite forged query scope", async (route, handler, loader) => {
    vi.mocked(getFinanceReportMembershipForUser).mockResolvedValue({ organizationId: "synthetic-company-a", organizationName: "Synthetic A" } as never);
    vi.mocked(loader).mockResolvedValue({ body: new Uint8Array([1]), filename: `synthetic.${route}` } as never);
    const response = await handler(new Request(`http://localhost/api/reports/${route}?report=unit-profit-loss&month=2026-07&organizationId=company-b&branchId=branch-b`));
    expect(response.status).toBe(200);
    expect(loader).toHaveBeenCalledWith(...(route === "excel"
      ? ["synthetic-company-a", expect.anything(), "Synthetic A"]
      : ["synthetic-company-a", "Synthetic A", expect.anything()]));
    expect(getFinanceReportMembershipForUser).toHaveBeenCalledWith("synthetic-user-a");
  });

  it.each(handlers)("%s pins artifact lookup to the authorized company", async (route, handler) => {
    vi.mocked(getOwnerStatementMembershipForUser).mockResolvedValue({ organizationId: "synthetic-company-a" } as never);
    vi.mocked(downloadOwnerStatementArtifact).mockRejectedValue(new Error("Synthetic foreign artifact unavailable"));
    const response = await handler(new Request(`http://localhost/api/reports/${route}?artifactId=00000000-0000-4000-8000-000000000099&organizationId=company-b`));
    expect(response.status).toBe(409);
    expect(downloadOwnerStatementArtifact).toHaveBeenCalledWith(expect.anything(), "synthetic-company-a", "00000000-0000-4000-8000-000000000099");
    expect(await response.text()).not.toContain("foreign");
  });
});
