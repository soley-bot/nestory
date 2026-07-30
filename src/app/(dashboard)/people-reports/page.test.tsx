import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

import PeopleReportsPage from "@/app/(dashboard)/people-reports/page";

describe("PeopleReportsPage compatibility redirect", () => {
  it("redirects old bookmarks to the People workspace", async () => {
    await expect(
      PeopleReportsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/people");
  });

  it("discards retired report filters instead of exposing the old report surface", async () => {
    await expect(
      PeopleReportsPage({
        searchParams: Promise.resolve({
          archiveState: "archived",
          report: "staff-access",
        }),
      }),
    ).rejects.toThrow("REDIRECT:/people");
  });
});
