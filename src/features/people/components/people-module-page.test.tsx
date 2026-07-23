import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAccessByPersonId,
  getPeopleInsightsData,
  getPeopleScreenData,
  parsePeopleSearchParams,
  requireAdminContext,
} = vi.hoisted(() => ({
  getAccessByPersonId: vi.fn(),
  getPeopleInsightsData: vi.fn(),
  getPeopleScreenData: vi.fn(),
  parsePeopleSearchParams: vi.fn(),
  requireAdminContext: vi.fn(),
}));

vi.mock("@/features/organization/data", () => ({ getAccessByPersonId }));
vi.mock("@/features/people/data/people-insights", () => ({
  getPeopleInsightsData,
}));
vi.mock("@/features/people/data/people", () => ({ getPeopleScreenData }));
vi.mock("@/features/people/people.filters", () => ({ parsePeopleSearchParams }));
vi.mock("@/lib/auth/context", () => ({ requireAdminContext }));

import { PeopleModulePageContent } from "./people-module-page";

describe("PeopleModulePageContent", () => {
  beforeEach(() => {
    getAccessByPersonId.mockReset();
    getPeopleInsightsData.mockReset();
    getPeopleScreenData.mockReset();
    parsePeopleSearchParams.mockReset();
    requireAdminContext.mockReset();

    requireAdminContext.mockResolvedValue({ organizationId: "organization-1" });
    parsePeopleSearchParams.mockReturnValue({ personId: null });
    getAccessByPersonId.mockResolvedValue({});
  });

  it("loads access only for active, non-archived Staff records", async () => {
    getPeopleScreenData.mockResolvedValue({
      pagination: { totalCount: 5 },
      people: [
        makePerson("active-staff", [{ role: "staff", status: "active" }]),
        makePerson("multi-role-staff", [
          { role: "tenant", status: "active" },
          { role: "staff", status: "active" },
        ]),
        makePerson("inactive-staff", [{ role: "staff", status: "inactive" }]),
        makePerson(
          "archived-staff",
          [{ role: "staff", status: "active" }],
          true,
        ),
        makePerson("active-tenant", [{ role: "tenant", status: "active" }]),
      ],
    });

    await PeopleModulePageContent({
      config: {
        addButtonLabel: "Add staff",
        description: "Staff records",
        role: "staff",
        searchPlaceholder: "Search staff",
        showAccessStatus: true,
        title: "Staff",
      },
      searchParams: Promise.resolve({}),
    });

    expect(getAccessByPersonId).toHaveBeenCalledWith("organization-1", [
      "active-staff",
      "multi-role-staff",
    ]);
  });
});

function makePerson(
  id: string,
  roles: Array<{ role: string; status: string }>,
  isArchived = false,
) {
  return { id, isArchived, roles };
}
