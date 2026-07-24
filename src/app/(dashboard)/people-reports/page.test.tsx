import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

import PeopleReportsPage from "@/app/(dashboard)/people-reports/page";

describe("PeopleReportsPage compatibility redirect", () => {
  it("redirects old bookmarks to central People Readiness", async () => {
    await expect(
      PeopleReportsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/reports/people-readiness");
  });

  it("maps the old report variant and archive intent to bounded central filters", async () => {
    await expect(
      PeopleReportsPage({
        searchParams: Promise.resolve({
          archiveState: "archived",
          report: "staff-access",
        }),
      }),
    ).rejects.toThrow(
      "REDIRECT:/reports/people-readiness?peopleView=staff&archiveState=archived",
    );
  });
});
