import { describe, expect, it } from "vitest";

import {
  filterAccessRegister,
  getInitialAccessRegisterView,
  getNoAccessStaff,
} from "./access-register-model";

const now = new Date("2026-08-12T12:00:00.000Z");

const branches = [
  {
    address: null,
    code: "BKK",
    id: "branch-bangkok",
    name: "Bangkok",
    status: "active",
  },
  {
    address: null,
    code: "CNX",
    id: "branch-chiang-mai",
    name: "Chiang Mai",
    status: "active",
  },
];

const staff = [
  {
    activeStaff: true,
    archived: false,
    description: "Staff - mina@example.com",
    id: "staff-mina",
    label: "Mina Chen",
    primaryEmail: "mina@example.com",
    roles: ["staff" as const],
  },
  {
    activeStaff: true,
    archived: false,
    description: "Staff - Arun",
    id: "staff-arun",
    label: "Arun Suriya",
    primaryEmail: "arun@example.com",
    roles: ["staff" as const],
  },
  {
    activeStaff: false,
    archived: true,
    description: "Archived Staff",
    id: "staff-archived",
    label: "Former Staff",
    primaryEmail: "former@example.com",
    roles: ["staff" as const],
  },
];

const members = [
  {
    branchId: branches[0]!.id,
    email: "arun.signin@example.com",
    id: "member-arun",
    personId: "staff-arun",
    role: "operations_manager" as const,
    userId: "user-arun",
  },
  {
    branchId: null,
    email: "finance@example.com",
    id: "member-finance",
    personId: null,
    role: "finance_manager" as const,
    userId: "user-finance",
  },
];

const invitations = [
  {
    branchId: branches[1]!.id,
    email: "pending@example.com",
    expiresAt: "2026-08-20T12:00:00.000Z",
    id: "invitation-pending",
    invitedAt: "2026-08-11T12:00:00.000Z",
    lastSentAt: "2026-08-11T12:01:00.000Z",
    personId: null,
    role: "operations_member" as const,
    status: "pending" as const,
  },
];

describe("getInitialAccessRegisterView", () => {
  it("opens the lifecycle view containing the validated focus target", () => {
    expect(getInitialAccessRegisterView({ focusedMemberId: "member-arun" })).toBe(
      "active",
    );
    expect(
      getInitialAccessRegisterView({ focusedInvitationId: "invitation-pending" }),
    ).toBe("invitations");
    expect(getInitialAccessRegisterView({ requestedStaffId: "staff-mina" })).toBe(
      "no_access",
    );
    expect(getInitialAccessRegisterView({})).toBe("active");
  });

  it("gives an invitation focus priority over a Staff handoff", () => {
    expect(
      getInitialAccessRegisterView({
        focusedInvitationId: "invitation-pending",
        requestedStaffId: "staff-mina",
      }),
    ).toBe("invitations");
  });
});

describe("getNoAccessStaff", () => {
  it("returns only active Staff without membership or invitation access", () => {
    expect(
      getNoAccessStaff({ branches, invitations, members, staff }, now).map(
        (person) => person.id,
      ),
    ).toEqual(["staff-mina"]);
  });

  it("excludes Staff linked to a failed or expired invitation", () => {
    const linkedInvitations = [
      {
        ...invitations[0]!,
        id: "invitation-failed",
        personId: "staff-mina",
        status: "send_failed" as const,
      },
    ];

    expect(
      getNoAccessStaff(
        { branches, invitations: linkedInvitations, members, staff },
        now,
      ),
    ).toEqual([]);
  });
});

describe("filterAccessRegister", () => {
  it("matches active member name and email without mutating the source", () => {
    const originalMembers = [...members];
    const result = filterAccessRegister({
      branches,
      invitations,
      members,
      people: staff,
      query: "ARUN",
      role: "all",
      scope: "all",
      staff: getNoAccessStaff({ branches, invitations, members, staff }, now),
    });

    expect(result.members.map((member) => member.id)).toEqual(["member-arun"]);
    expect(members).toEqual(originalMembers);
  });

  it("filters invitations by exact role and branch scope", () => {
    const result = filterAccessRegister({
      branches,
      invitations,
      members,
      people: staff,
      query: "",
      role: "operations_member",
      scope: "branch-chiang-mai",
      staff: [],
    });

    expect(result.invitations.map((invitation) => invitation.id)).toEqual([
      "invitation-pending",
    ]);
    expect(result.members).toEqual([]);
  });

  it("matches organization-wide records through the organization scope", () => {
    const result = filterAccessRegister({
      branches,
      invitations,
      members,
      people: staff,
      query: "finance@example.com",
      role: "finance_manager",
      scope: "organization",
      staff: [],
    });

    expect(result.members.map((member) => member.id)).toEqual(["member-finance"]);
  });
});
