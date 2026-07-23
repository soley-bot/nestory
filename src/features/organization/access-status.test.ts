import { describe, expect, it } from "vitest";

import { buildAccessByPersonId } from "./access-status";

const now = new Date("2026-07-23T12:00:00.000Z");

const membership = {
  branchId: "branch-1",
  email: "staff@example.com",
  id: "membership-1",
  personId: "person-1",
  role: "manager" as const,
  userId: "auth-user-secret-to-presentation",
};

const invitation = {
  branchId: null,
  email: "invite@example.com",
  expiresAt: "2026-07-30T12:00:00.000Z",
  id: "invitation-1",
  invitedAt: "2026-07-22T12:00:00.000Z",
  lastSentAt: "2026-07-22T12:05:00.000Z",
  personId: "person-1",
  role: "member" as const,
  status: "pending" as const,
};

describe("buildAccessByPersonId", () => {
  it("returns explicit no-access records and deduplicates requested people", () => {
    expect(
      buildAccessByPersonId(["person-1", "person-1", "person-2"], [], [], now),
    ).toEqual({
      "person-1": {
        primaryAction: "grant_access",
        state: "no_access",
      },
      "person-2": {
        primaryAction: "grant_access",
        state: "no_access",
      },
    });
  });

  it("returns active workspace access with presentation-safe action data", () => {
    expect(
      buildAccessByPersonId(["person-1"], [membership], [], now, [
        { id: "branch-1", name: "Central Office" },
      ]),
    ).toEqual({
      "person-1": {
        branchId: "branch-1",
        email: "staff@example.com",
        membershipId: "membership-1",
        primaryAction: "manage_access",
        role: "manager",
        scopeLabel: "Central Office",
        state: "active_workspace_access",
      },
    });
  });

  it("keeps Administrator access organization-wide despite a stale branch link", () => {
    const adminMembership = { ...membership, role: "admin" as const };
    const adminInvitation = {
      ...invitation,
      branchId: "branch-1",
      personId: "person-2",
      role: "admin" as const,
    };

    const result = buildAccessByPersonId(
      ["person-1", "person-2"],
      [adminMembership],
      [adminInvitation],
      now,
      [{ id: "branch-1", name: "Central Office" }],
    );

    expect(result["person-1"]).toMatchObject({
      role: "admin",
      scopeLabel: "All branches",
      state: "active_workspace_access",
    });
    expect(result["person-2"]).toMatchObject({
      role: "admin",
      scopeLabel: "All branches",
      state: "invitation_pending",
    });
  });

  it("prefers active workspace access over any invitation", () => {
    expect(
      buildAccessByPersonId(["person-1"], [membership], [invitation], now)["person-1"],
    ).toMatchObject({
      membershipId: "membership-1",
      state: "active_workspace_access",
    });
  });

  it("selects an active membership deterministically if legacy data has duplicates", () => {
    const firstById = { ...membership, id: "membership-a", role: "member" as const };
    const lastById = { ...membership, id: "membership-z", role: "admin" as const };

    expect(
      buildAccessByPersonId(
        ["person-1"],
        [firstById, lastById],
        [invitation],
        now,
      )["person-1"],
    ).toMatchObject({
      membershipId: "membership-a",
      role: "member",
      state: "active_workspace_access",
    });
  });

  it("returns invitation pending with review action data", () => {
    expect(buildAccessByPersonId(["person-1"], [], [invitation], now)).toEqual({
      "person-1": {
        branchId: null,
        email: "invite@example.com",
        expiresAt: "2026-07-30T12:00:00.000Z",
        invitationId: "invitation-1",
        lastSentAt: "2026-07-22T12:05:00.000Z",
        primaryAction: "review_invitation",
        role: "member",
        scopeLabel: "All branches",
        state: "invitation_pending",
      },
    });
  });

  it("returns delivery failed with a retry action", () => {
    const failed = {
      ...invitation,
      deliveryError: "Raw provider diagnostics must never reach presentation",
      status: "send_failed" as const,
    };

    expect(buildAccessByPersonId(["person-1"], [], [failed], now)["person-1"]).toEqual({
      branchId: null,
      email: "invite@example.com",
      expiresAt: "2026-07-30T12:00:00.000Z",
      invitationId: "invitation-1",
      lastSentAt: "2026-07-22T12:05:00.000Z",
      primaryAction: "retry_invitation",
      role: "member",
      scopeLabel: "All branches",
      state: "delivery_failed",
    });
  });

  it("derives expiration from the authoritative timestamp", () => {
    const expired = {
      ...invitation,
      expiresAt: now.toISOString(),
      status: "pending" as const,
    };

    expect(buildAccessByPersonId(["person-1"], [], [expired], now)["person-1"]).toEqual({
      branchId: null,
      email: "invite@example.com",
      expiresAt: now.toISOString(),
      invitationId: "invitation-1",
      lastSentAt: "2026-07-22T12:05:00.000Z",
      primaryAction: "review_invitation",
      role: "member",
      scopeLabel: "All branches",
      state: "expired",
    });
  });

  it("selects the most actionable invitation deterministically", () => {
    const olderFailure = {
      ...invitation,
      id: "failure-a",
      invitedAt: "2026-07-20T12:00:00.000Z",
      status: "send_failed" as const,
    };
    const newerPending = {
      ...invitation,
      id: "pending-z",
      invitedAt: "2026-07-23T10:00:00.000Z",
    };
    const expired = {
      ...invitation,
      expiresAt: "2026-07-22T12:00:00.000Z",
      id: "expired-z",
      invitedAt: "2026-07-23T11:00:00.000Z",
    };

    expect(
      buildAccessByPersonId(
        ["person-1"],
        [],
        [newerPending, expired, olderFailure],
        now,
      )["person-1"],
    ).toMatchObject({
      invitationId: "failure-a",
      state: "delivery_failed",
    });
  });

  it("keeps legacy unlinked access records out of person status", () => {
    const result = buildAccessByPersonId(
      ["person-1"],
      [{ ...membership, id: "legacy-member", personId: null }],
      [{ ...invitation, id: "legacy-invite", personId: null }],
      now,
    );

    expect(result).toEqual({
      "person-1": {
        primaryAction: "grant_access",
        state: "no_access",
      },
    });
    expect(result).not.toHaveProperty("null");
  });
});
