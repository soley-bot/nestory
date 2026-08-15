import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));

import {
  getAccessByPersonId,
  getAccessSettingsData,
  getOrganizationSettingsData,
} from "./data";

describe("getOrganizationSettingsData", () => {
  it("loads and normalizes the organization appearance", async () => {
    const appearanceQuery = {
      eq: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: {
          accent_preset: "custom",
          accent_seed: "#2563EB",
          logo_storage_path: "organization-1/logos/logo.png",
          theme_mode: "dark",
        },
        error: null,
      }),
    };
    appearanceQuery.select.mockReturnValue(appearanceQuery);
    appearanceQuery.eq.mockReturnValue(appearanceQuery);
    const branches = chainQuery({ data: [], error: null }, "order");
    const teams = chainQuery({ data: [], error: null }, "order");
    const roles = chainQuery({ data: [], error: null }, "is");
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.test/company-logo" },
      error: null,
    });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "organizations") return appearanceQuery;
        if (table === "organization_branches") return branches;
        if (table === "organization_teams") return teams;
        if (table === "person_roles") return roles;
        throw new Error(`Unexpected table ${table}`);
      }),
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    });

    await expect(getOrganizationSettingsData("organization-1")).resolves.toEqual({
      appearance: {
        accentPreset: "custom",
        accentSeed: "#2563EB",
        mode: "dark",
      },
      branches: [],
      logoStoragePath: "organization-1/logos/logo.png",
      logoUrl: "https://storage.test/company-logo",
      staff: [],
      teams: [],
    });
    expect(createSignedUrl).toHaveBeenCalledWith(
      "organization-1/logos/logo.png",
      3600,
    );
  });
});

describe("getAccessByPersonId", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:00:00.000Z"));
    createSupabaseServerClient.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives organization-scoped membership, invitation, and no-access states", async () => {
    const invitationQuery = {
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
    };
    invitationQuery.select.mockReturnValue(invitationQuery);
    invitationQuery.eq.mockReturnValue(invitationQuery);
    invitationQuery.in.mockReturnValue(invitationQuery);
    invitationQuery.order.mockResolvedValue({
      data: [
        {
          branch_id: null,
          email: "pending@example.com",
          expires_at: "2026-07-30T12:00:00.000Z",
          id: "invitation-1",
          invited_at: "2026-07-22T12:00:00.000Z",
          last_sent_at: "2026-07-22T12:05:00.000Z",
          person_id: "person-pending",
          role: "operations_member",
          status: "pending",
        },
        {
          branch_id: "branch-1",
          email: "active-invite@example.com",
          expires_at: "2026-07-30T12:00:00.000Z",
          id: "invitation-for-active-member",
          invited_at: "2026-07-23T11:00:00.000Z",
          last_sent_at: null,
          person_id: "person-active",
          role: "super_admin",
          status: "pending",
        },
        {
          branch_id: null,
          email: "failed@example.com",
          expires_at: "2026-07-30T12:00:00.000Z",
          id: "invitation-failed",
          invited_at: "2026-07-22T12:00:00.000Z",
          last_sent_at: null,
          person_id: "person-failed",
          role: "operations_manager",
          status: "send_failed",
        },
        {
          branch_id: null,
          email: "expired@example.com",
          expires_at: "2026-07-30T12:00:00.000Z",
          id: "invitation-expired",
          invited_at: "2026-07-22T12:00:00.000Z",
          last_sent_at: null,
          person_id: "person-expired",
          role: "operations_member",
          status: "expired",
        },
        {
          branch_id: null,
          email: "unlinked@example.com",
          expires_at: "2026-07-30T12:00:00.000Z",
          id: "invitation-unlinked",
          invited_at: "2026-07-22T12:00:00.000Z",
          last_sent_at: null,
          person_id: null,
          role: "super_admin",
          status: "pending",
        },
      ],
      error: null,
    });

    const branchQuery = {
      eq: vi.fn(),
      is: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
    };
    branchQuery.select.mockReturnValue(branchQuery);
    branchQuery.eq.mockReturnValue(branchQuery);
    branchQuery.is.mockReturnValue(branchQuery);
    branchQuery.order.mockResolvedValue({
      data: [
        {
          address: null,
          code: "CENTRAL",
          id: "branch-1",
          name: "Central Office",
          status: "active",
        },
      ],
      error: null,
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "organization_invitations") {
          return invitationQuery;
        }

        expect(table).toBe("organization_branches");
        return branchQuery;
      }),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            branch_id: "branch-1",
            email: "active@example.com",
            id: "membership-1",
            person_id: "person-active",
            role: "operations_manager",
            user_id: "auth-user-1",
          },
          {
            branch_id: null,
            email: "unlinked-member@example.com",
            id: "membership-unlinked",
            person_id: null,
            role: "operations_member",
            user_id: "auth-user-unlinked",
          },
          {
            branch_id: null,
            email: "finance@example.com",
            id: "membership-finance",
            person_id: "person-finance",
            role: "finance_manager",
            user_id: "auth-user-finance",
          },
        ],
        error: null,
      }),
    };
    createSupabaseServerClient.mockResolvedValue(supabase);

    const result = await getAccessByPersonId("organization-1", [
      "person-active",
      "person-pending",
      "person-failed",
      "person-expired",
      "person-none",
      "person-finance",
    ]);

    expect(supabase.rpc).toHaveBeenCalledWith("get_organization_access_members", {
      p_organization_id: "organization-1",
    });
    expect(invitationQuery.eq).toHaveBeenCalledWith(
      "organization_id",
      "organization-1",
    );
    expect(invitationQuery.in).toHaveBeenCalledWith("status", [
      "pending",
      "send_failed",
      "expired",
    ]);
    expect(result).toMatchObject({
      "person-active": {
        membershipId: "membership-1",
        scopeLabel: "Central Office",
        state: "active_workspace_access",
      },
      "person-expired": {
        invitationId: "invitation-expired",
        state: "expired",
      },
      "person-failed": {
        invitationId: "invitation-failed",
        state: "delivery_failed",
      },
      "person-finance": {
        membershipId: "membership-finance",
        role: "finance_manager",
        state: "active_workspace_access",
      },
      "person-none": {
        state: "no_access",
      },
      "person-pending": {
        invitationId: "invitation-1",
        lastSentAt: "2026-07-22T12:05:00.000Z",
        scopeLabel: "Branch required",
        state: "invitation_pending",
      },
    });
    expect(result).not.toHaveProperty("null");
  });

  it("does not initialize a database client for an empty request", async () => {
    await expect(getAccessByPersonId("organization-1", [])).resolves.toEqual({});
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("fails clearly when the authoritative workspace member read fails", async () => {
    const branchQuery = chainQuery({ data: [], error: null }, "order");
    const invitationQuery = chainQuery({ data: [], error: null }, "order");
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "organization_branches") return branchQuery;
        if (table === "organization_invitations") return invitationQuery;
        throw new Error(`Unexpected direct table read: ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "permission denied" },
      }),
    };
    createSupabaseServerClient.mockResolvedValue(supabase);

    await expect(
      getAccessByPersonId("organization-1", ["person-1"]),
    ).rejects.toThrow("Could not load workspace members: permission denied");
    expect(supabase.from).not.toHaveBeenCalledWith("organization_members");
  });

  it("reports invalid persisted workspace roles as an integrity error", async () => {
    const branchQuery = chainQuery({ data: [], error: null }, "order");
    const invitationQuery = chainQuery({ data: [], error: null }, "order");
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "organization_branches") return branchQuery;
        if (table === "organization_invitations") return invitationQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({
        data: [{
          branch_id: null,
          email: "member@example.com",
          id: "membership-1",
          person_id: "person-1",
          role: "legacy_admin",
          user_id: "auth-user-1",
        }],
        error: null,
      }),
    };
    createSupabaseServerClient.mockResolvedValue(supabase);

    await expect(
      getAccessByPersonId("organization-1", ["person-1"]),
    ).rejects.toThrow("Workspace access contains an unsupported role.");
  });

  it("returns active Staff selector options with authoritative primary email context", async () => {
    const branchQuery = chainQuery({ data: [], error: null }, "order");
    const invitationQuery = chainQuery({ data: [], error: null }, "order");
    const roleQuery = chainQuery({
      data: [
        { person_id: "person-1" },
        { person_id: "person-1" },
      ],
      error: null,
    }, "is");
    const peopleQuery = chainQuery({
      data: [{
        archived_at: null,
        display_name: "Mara Chen",
        id: "person-1",
        primary_email: "mara@example.com",
        primary_phone: "+66 80 000 0000",
      }],
      error: null,
    }, "order");
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "organization_branches") return branchQuery;
        if (table === "organization_invitations") return invitationQuery;
        if (table === "person_roles") return roleQuery;
        if (table === "people") return peopleQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    createSupabaseServerClient.mockResolvedValue(supabase);

    const result = await getAccessSettingsData("organization-1");

    expect(peopleQuery.select).toHaveBeenCalledWith(
      "id, display_name, primary_email, primary_phone, archived_at",
    );
    expect(roleQuery.eq).toHaveBeenCalledWith("organization_id", "organization-1");
    expect(roleQuery.eq).toHaveBeenCalledWith("role", "staff");
    expect(roleQuery.eq).toHaveBeenCalledWith("status", "active");
    expect(roleQuery.is).toHaveBeenCalledWith("archived_at", null);
    expect(peopleQuery.eq).toHaveBeenCalledWith("organization_id", "organization-1");
    expect(peopleQuery.is).toHaveBeenCalledWith("archived_at", null);
    expect(result.staff).toEqual([{
      activeStaff: true,
      archived: false,
      description: "Staff · mara@example.com",
      id: "person-1",
      label: "Mara Chen",
      primaryEmail: "mara@example.com",
      roles: ["staff"],
    }]);
    expect(result.linkedPeople).toEqual(result.staff);
  });
});

function chainQuery(
  result: { data: unknown[]; error: null },
  terminal: "is" | "order",
) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query[terminal].mockResolvedValue(result);
  return query;
}
