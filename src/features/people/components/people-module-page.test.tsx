import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAccessByPersonId,
  getPeopleInsightsData,
  getPeopleScreenData,
  parsePeopleSearchParams,
  requirePermission,
} = vi.hoisted(() => ({
  getAccessByPersonId: vi.fn(),
  getPeopleInsightsData: vi.fn(),
  getPeopleScreenData: vi.fn(),
  parsePeopleSearchParams: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/features/organization/data", () => ({ getAccessByPersonId }));
vi.mock("@/features/people/data/people-insights", () => ({
  getPeopleInsightsData,
}));
vi.mock("@/features/people/data/people", () => ({ getPeopleScreenData }));
vi.mock("@/features/people/people.filters", () => ({ parsePeopleSearchParams }));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));

import {
  PeopleInsightsAction,
  PeopleModulePageContent,
} from "./people-module-page";

describe("PeopleModulePageContent", () => {
  beforeEach(() => {
    getAccessByPersonId.mockReset();
    getPeopleInsightsData.mockReset();
    getPeopleScreenData.mockReset();
    parsePeopleSearchParams.mockReset();
    requirePermission.mockReset();

    requirePermission.mockResolvedValue({
      isSuperAdmin: true,
      organizationId: "organization-1",
      permissionKeys: new Set(["people.view", "people.write"]),
    });
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
    expect(requirePermission).toHaveBeenCalledWith("people.view");
  });

  it("does not expose organization access status to ordinary viewers", async () => {
    requirePermission.mockResolvedValue({
      isSuperAdmin: false,
      organizationId: "organization-1",
      permissionKeys: new Set(["people.view"]),
    });
    getPeopleScreenData.mockResolvedValue({
      pagination: { totalCount: 1 },
      people: [makePerson("active-staff", [{ role: "staff", status: "active" }])],
    });

    await PeopleModulePageContent({
      config: {
        addButtonLabel: "Add staff",
        role: "staff",
        searchPlaceholder: "Search staff",
        showAccessStatus: true,
        title: "Staff",
      },
      searchParams: Promise.resolve({}),
    });

    expect(getAccessByPersonId).not.toHaveBeenCalled();
  });

  it("does not block the people register on insights", async () => {
    getPeopleScreenData.mockResolvedValue({
      pagination: { totalCount: 0 },
      people: [],
    });
    getPeopleInsightsData.mockReturnValue(new Promise(() => undefined));

    await PeopleModulePageContent({
      config: {
        addButtonLabel: "Add person",
        searchPlaceholder: "Search people",
        showInsights: true,
        title: "People",
      },
      searchParams: Promise.resolve({}),
    });

    expect(getPeopleScreenData).toHaveBeenCalledWith(
      "organization-1",
      expect.anything(),
    );
    expect(getPeopleInsightsData).not.toHaveBeenCalled();
  });

  it("loads insights through the organization-scoped streamed action", async () => {
    getPeopleInsightsData.mockResolvedValue({ metrics: [] });

    await PeopleInsightsAction({ organizationId: "organization-1" });

    expect(getPeopleInsightsData).toHaveBeenCalledWith("organization-1");
  });
});

function makePerson(
  id: string,
  roles: Array<{ role: string; status: string }>,
  isArchived = false,
) {
  return { id, isArchived, roles };
}
