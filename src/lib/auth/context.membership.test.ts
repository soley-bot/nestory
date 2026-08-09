import { describe, expect, it, vi } from "vitest";

import { getWorkspaceMembershipForUser } from "@/lib/auth/context";

describe("workspace membership appearance", () => {
  it("loads and normalizes the organization theme with membership", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        branch_id: null,
        created_at: "2026-08-09T00:00:00Z",
        organization_id: "org-1",
        organizations: {
          accent_preset: "ocean",
          accent_seed: null,
          name: "Nestory Test",
          slug: "nestory-test",
          theme_mode: "dark",
        },
        person_id: null,
        role: "super_admin",
      },
      error: null,
    });
    const query = {
      eq: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
      maybeSingle,
      order: vi.fn(),
      select: vi.fn(),
    };
    for (const method of ["eq", "in", "limit", "order", "select"] as const) {
      query[method].mockReturnValue(query);
    }
    const client = { from: vi.fn().mockReturnValue(query) };

    await expect(
      getWorkspaceMembershipForUser("user-1", client as never, {
        organizationSlug: null,
      }),
    ).resolves.toMatchObject({
      organizationId: "org-1",
      theme: { accentPreset: "ocean", accentSeed: null, mode: "dark" },
    });
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("theme_mode"),
    );
  });
});
