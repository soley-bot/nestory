/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPeopleReportHubData, requireAdminContext } = vi.hoisted(() => ({
  getPeopleReportHubData: vi.fn(),
  requireAdminContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireAdminContext }));
vi.mock("@/features/people/data/people-reports", () => ({
  getPeopleReportHubData,
}));

import PeopleReportsPage from "@/app/(dashboard)/people-reports/page";

describe("PeopleReportsPage", () => {
  beforeEach(() => {
    requireAdminContext.mockReset();
    getPeopleReportHubData.mockReset();
    requireAdminContext.mockResolvedValue({
      organizationId: "organization-1",
      organizationName: "Demo Organization",
      role: "admin",
      userId: "user-1",
    });
    getPeopleReportHubData.mockResolvedValue({
      pagination: {
        page: 1,
        pageSize: 100,
        totalCount: 145,
        totalPages: 2,
      },
      people: [],
      reportLimit: 100,
    });
  });

  it("keeps People Reports distinct, indexed, and explicit about its report window", async () => {
    const html = renderToStaticMarkup(await PeopleReportsPage());
    const document = new DOMParser().parseFromString(html, "text/html");
    const navigation = document.querySelector('nav[aria-label="People views"]');

    expect(navigation).not.toBeNull();
    expect(
      navigation?.querySelectorAll('a[aria-current="page"]'),
    ).toHaveLength(1);
    expect(
      navigation?.querySelector('a[aria-current="page"]')?.textContent,
    ).toContain("Reports");
    expect(
      document.querySelectorAll('[data-people-report-item="true"]'),
    ).toHaveLength(5);
    expect(document.querySelectorAll("article")).toHaveLength(0);
    expect(
      document
        .querySelector('[data-mobile-summary-strip="people-report-metrics"]')
        ?.getAttribute("class"),
    ).toContain("overflow-x-auto");
    expect(document.body.textContent).toContain(
      "100 of 145 active records in this report window",
    );
    expect(
      document.querySelector(
        'a[aria-label="Preview Relationship Readiness"]',
      )?.getAttribute("href"),
    ).toBe("/people?archiveState=all");
    expect(
      document.querySelector(
        'a[aria-label="Export Relationship Readiness CSV"]',
      )?.getAttribute("href"),
    ).toBe("/api/people-reports/export?report=relationship-readiness");
    expect(
      document.querySelector(
        'a[aria-label="Export Relationship Readiness PDF"]',
      )?.getAttribute("href"),
    ).toBe("/api/people-reports/pdf?report=relationship-readiness");
  });
});
