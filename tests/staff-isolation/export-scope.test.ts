import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as excel } from "@/app/api/reports/excel/route";
import { GET as pdf } from "@/app/api/reports/pdf/route";
import { getReportExcel } from "@/features/reports/data/excel";
import { getReportPdf } from "@/features/reports/data/pdf";
import { getCurrentUser, getFinanceReportMembershipForUser } from "@/lib/auth/context";
import { companies, fixture } from "./fixtures";

vi.mock("@/lib/auth/context", () => ({ getCurrentUser: vi.fn(), getFinanceReportMembershipForUser: vi.fn(), getOwnerStatementMembershipForUser: vi.fn() }));
vi.mock("@/features/reports/data/excel", () => ({ getReportExcel: vi.fn() }));
vi.mock("@/features/reports/data/pdf", () => ({ getReportPdf: vi.fn() }));
vi.mock("@/features/reports/data/owner-statement-artifacts", () => ({ downloadOwnerStatementArtifact: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/observability/capture-unexpected-server-error", () => ({ captureUnexpectedServerError: vi.fn() }));

const routes = [{ format: "excel", handler: excel, loader: getReportExcel }, { format: "pdf", handler: pdf, loader: getReportPdf }] as const;
const cases = companies.flatMap((company) => routes.flatMap((route) =>
  (["allowed-A", "allowed-B", "anonymous", "permission-denied", "forged-authority", "loader-denied-foreign", "malformed-scope"] as const).map((scenario) => ({ company, route, scenario })),
));

describe("synthetic export authority handoff (28 mock cases)", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(cases)("$company $route.format $scenario", async ({ company, route, scenario }) => {
    const scope = fixture(company, scenario === "allowed-B" ? "B" : "A");
    const foreign = fixture(company === "C1" ? "C2" : "C1", "B");
    vi.mocked(getCurrentUser).mockResolvedValue(scenario === "anonymous" ? null : { id: scope.userId } as never);
    vi.mocked(getFinanceReportMembershipForUser).mockResolvedValue(scenario === "permission-denied" ? null : {
      organizationId: scope.organizationId, organizationName: company, branchId: scope.branch,
    } as never);
    const blocked = scenario === "loader-denied-foreign" || scenario === "malformed-scope";
    vi.mocked(route.loader).mockResolvedValue(blocked
      ? { validation: { message: "Synthetic unavailable scope", status: 409 } } as never
      : { body: scope.bytes, filename: `${company}-${scope.branch}.pdf` } as never);
    const params = new URLSearchParams({ report: "unit-profit-loss", month: "2026-10" });
    if (scenario === "forged-authority") {
      params.set("organizationId", foreign.organizationId);
      params.set("branchId", foreign.branch);
      params.set("userId", foreign.userId);
    }
    if (scenario === "loader-denied-foreign") params.set("propertyId", foreign.propertyId);
    if (scenario === "malformed-scope") params.set("propertyId", "not-a-uuid");
    const response = await route.handler(new Request(`http://localhost/api/reports/${route.format}?${params}`));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    if (scenario === "anonymous" || scenario === "permission-denied") {
      expect(response.status).toBe(scenario === "anonymous" ? 401 : 403);
      expect(getReportExcel).not.toHaveBeenCalled();
      expect(getReportPdf).not.toHaveBeenCalled();
      return;
    }
    expect(getFinanceReportMembershipForUser).toHaveBeenCalledExactlyOnceWith(scope.userId);
    expect(route.loader).toHaveBeenCalledTimes(1);
    const call = vi.mocked(route.loader).mock.calls[0];
    expect(call[0]).toBe(scope.organizationId);
    const query = call[route.format === "excel" ? 1 : 2];
    expect(query).toMatchObject({ report: "unit-profit-loss", month: "2026-10" });
    if (scenario === "loader-denied-foreign") expect(query).toMatchObject({ propertyId: foreign.propertyId });
    if (scenario === "malformed-scope") expect(query).toMatchObject({ scopeInvalid: true });
    if (blocked) {
      expect(response.status).toBe(409);
      expect(await response.text()).toBe("Synthetic unavailable scope");
    } else {
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(scope.bytes);
    }
  });
});
