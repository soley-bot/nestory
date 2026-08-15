import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

import LegacyUsersRolesPage from "@/app/(dashboard)/users-roles/page";

describe("legacy workspace access route", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("preserves only validated access focus parameters", async () => {
    const personId = "11111111-1111-4111-8111-111111111111";

    await expect(
      LegacyUsersRolesPage({
        searchParams: Promise.resolve({
          email: "ignored@example.com",
          memberId: "not-a-uuid",
          personId,
        }),
      }),
    ).rejects.toThrow(
      `redirect:/settings/access?personId=${personId}`,
    );
  });
});
