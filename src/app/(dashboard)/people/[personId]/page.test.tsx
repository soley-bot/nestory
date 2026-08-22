import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessByPersonId, getPersonDetail, requirePermission } = vi.hoisted(
  () => ({
    getAccessByPersonId: vi.fn(),
    getPersonDetail: vi.fn(),
    requirePermission: vi.fn(),
  }),
);

vi.mock("@/features/organization/data", () => ({ getAccessByPersonId }));
vi.mock("@/features/people/data/people", () => ({ getPersonDetail }));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));

import PersonPage from "./page";

describe("person detail access loading", () => {
  beforeEach(() => {
    getAccessByPersonId.mockReset();
    getPersonDetail.mockReset();
    requirePermission.mockReset();
    requirePermission.mockResolvedValue({
      isSuperAdmin: true,
      organizationId: "organization-1",
      permissionKeys: new Set(["people.view", "people.write", "people.archive"]),
    });
    getAccessByPersonId.mockResolvedValue({
      "person-1": {
        primaryAction: "grant_access",
        state: "no_access",
      },
    });
  });

  it("loads access for an active Staff role in a multi-role record", async () => {
    const person = makePerson([
      { role: "tenant", status: "active" },
      { role: "staff", status: "active" },
    ]);
    getPersonDetail.mockResolvedValue(person);

    const result = await PersonPage({ params: Promise.resolve({ personId: "person-1" }) });

    expect(getAccessByPersonId).toHaveBeenCalledWith("organization-1", ["person-1"]);
    expect(result.props.person).toBe(person);
    expect(result.props.accessStatus).toEqual({
      primaryAction: "grant_access",
      state: "no_access",
    });
  });

  it.each([
    ["non-staff", [{ role: "tenant", status: "active" }], false],
    ["inactive Staff", [{ role: "staff", status: "inactive" }], false],
    ["archived Staff", [{ role: "staff", status: "active" }], true],
  ])("does not load access for %s records", async (_label, roles, isArchived) => {
    getPersonDetail.mockResolvedValue(makePerson(roles, isArchived));

    const result = await PersonPage({ params: Promise.resolve({ personId: "person-1" }) });

    expect(getAccessByPersonId).not.toHaveBeenCalled();
    expect(result.props.accessStatus).toBeUndefined();
  });
});

function makePerson(
  roles: Array<{ role: string; status: string }>,
  isArchived = false,
) {
  return {
    id: "person-1",
    isArchived,
    roles,
  };
}
