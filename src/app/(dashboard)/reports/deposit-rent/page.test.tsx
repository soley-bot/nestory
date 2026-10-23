import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancialWriteProvider } from "@/lib/finance/financial-write-provider";

const { readBoundary } = vi.hoisted(() => ({ readBoundary: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ withFinancialReadContext: readBoundary }));
beforeEach(() => { readBoundary.mockReset(); readBoundary.mockImplementation(async (_org, read) => read({ generation: 2 })); });
const { requirePermission, client, finance, report } = vi.hoisted(() => ({
  requirePermission: vi.fn(), client: {}, finance: vi.fn(), report: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/features/finance-operations/data/scoped-finance-context", () => ({ loadScopedFinanceContext: finance }));
vi.mock("@/features/reports/data/deposit-rent-local-source", () => ({ loadLocalDepositReport: report }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Error(`redirect:${path}`); } }));
vi.mock("@/components/layout/workspace-page", () => ({ WorkspacePage: ({ children, breadcrumbItems }: {
  children: ReactNode; breadcrumbItems: { href: string; label: string }[];
}) => <main>{breadcrumbItems.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}{children}</main> }));
import DepositRentReportPage from "./page";

const propertyId = "00000000-0000-4000-8000-000000000031";
const context = { userId: "actor", organizationId: "company", operationalTimezone: "UTC",
  permissionKeys: new Set(["finance.view", "leases.view"]), capabilities: { canReadFinanceReports: false } };
const render = async (params: Record<string, string> = {}) => renderToStaticMarkup(await DepositRentReportPage({ searchParams: Promise.resolve(params) }));

describe("deposit settlement report route", () => {
  it("hides amounts and download links if the verified payload differs from the browser session", async () => {
    report.mockResolvedValue({ periodLabel: "October 2026", columns: [], rows: [], summary: [{ label: "Settlements", value: "USD 125.00" }], sourceFingerprint: "a".repeat(64) });
    const page = await DepositRentReportPage({ searchParams: Promise.resolve({ propertyId, month: "2026-10" }) });
    const html = renderToStaticMarkup(<FinancialWriteProvider organizationId="company" context={{ generation: 1, status: "open", enforced: true, financial_start_date: "2026-10-01" }}>{page}</FinancialWriteProvider>);
    expect(html).not.toContain("USD 125.00");
    expect(html).not.toContain("Download PDF");
    expect(html).toContain("Settlement property");
    expect(html).toContain("verify the financial session");
  });
  it("does not load report or selector sources while the financial context is unavailable", async () => {
    readBoundary.mockRejectedValueOnce(new Error("Financial reporting is paused"));
    await expect(render({ propertyId, month: "2026-10" })).rejects.toThrow("paused");
    expect(finance).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(readBoundary).toHaveBeenCalledWith("company", expect.any(Function), "2026-10-01");
  });
  it("discards a report assembled across a reset or ordinary source change", async () => {
    readBoundary.mockImplementationOnce(async (_org, read) => { await read({ generation: 2 }); throw new Error("Financial data changed while loading"); });
    await expect(render({ propertyId, month: "2026-10" })).rejects.toThrow("changed while");
    expect(report).toHaveBeenCalledOnce();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue(context);
    finance.mockResolvedValue({ properties: [{ id: propertyId, code: "SYN", name: "Synthetic property" }] });
    report.mockResolvedValue({ periodLabel: "October 2026", columns: [], rows: [], summary: [], sourceFingerprint: "a".repeat(64) });
  });
  it("gives finance members an accessible lease breadcrumb", async () => {
    const html = await render({ month: "2026-10" });
    expect(html).toContain('href="/leases"');
    expect(html).not.toContain('href="/reports"');
    expect(requirePermission).toHaveBeenCalledWith("finance.view");
  });
  it("uses the reports index for members with report-index access", async () => {
    requirePermission.mockResolvedValue({ ...context, capabilities: { canReadFinanceReports: true } });
    expect(await render({ month: "2026-10" })).toContain('href="/reports"');
  });
  it("denies finance-only access before reading sources", async () => {
    requirePermission.mockResolvedValue({ ...context, permissionKeys: new Set(["finance.view"]) });
    await expect(render()).rejects.toThrow("redirect:/no-access?reason=capability");
    expect(finance).not.toHaveBeenCalled();
  });
  it("does not read another property and presents a scope error", async () => {
    expect(await render({ propertyId: "00000000-0000-4000-8000-000000000032", month: "2026-10" })).toContain("This property is unavailable");
    expect(report).not.toHaveBeenCalled();
  });
  it("loads the checked monthly scope and offers both downloads without publication access", async () => {
    const html = await render({ propertyId, month: "2026-10" });
    expect(report).toHaveBeenCalledWith(client, { actorId: "actor", organizationId: "company", propertyIds: [propertyId], periodStart: "2026-10-01", periodEnd: "2026-10-31" });
    expect(html.match(/financialGeneration=2/g)).toHaveLength(2);
    expect(html).toContain("Download PDF");
    expect(html).toContain("Download Excel");
    expect(html.match(new RegExp(`expectedFingerprint=${"a".repeat(64)}`, "g"))).toHaveLength(2);
  });
  it("does not count technical metadata as deposit activity", async () => {
    report.mockResolvedValue({ periodLabel: "October 2026", columns: [], summary: [], sourceFingerprint: "a".repeat(64), rows: [{ id: "metadata:fingerprint", title: "Report context", cells: { detail: "technical-fingerprint" } }] });
    const html = await render({ propertyId, month: "2026-10" });
    expect(html).toContain("No deposit rent settlements in this period");
    expect(html).not.toContain("technical-fingerprint");
  });
});
