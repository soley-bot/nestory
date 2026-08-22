import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getClaims: vi.fn(),
  maybeSingle: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "localhost:3000" })),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import * as authContext from "@/lib/auth/context";

describe("owner balance authority contexts", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockReset();
    mocks.getClaims.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.redirect.mockClear();

    const query = {
      eq: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
      maybeSingle: mocks.maybeSingle,
      order: vi.fn(),
      select: vi.fn(),
    };
    for (const method of ["eq", "in", "limit", "order", "select"] as const) {
      query[method].mockReturnValue(query);
    }

    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          email: "finance.manager@nestory.com",
          sub: "finance-manager-user",
        },
      },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        branch_id: null,
        created_at: "2026-08-09T00:00:00Z",
        organization_id: "org-1",
        organizations: {
          accent_preset: "ocean",
          accent_seed: null,
          name: "Nestory Test",
          slug: "nestory-test",
          theme_mode: "light",
        },
        person_id: null,
        role: "finance_manager",
      },
      error: null,
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      from: vi.fn().mockReturnValue(query),
    });
  });

  it("contains legacy Finance Manager owner-balance authority", async () => {
    const legacyContexts = [
      authContext.requireOwnerBalanceReadContext,
      authContext.requireOwnerOpeningBalanceCorrectionContext,
      authContext.requireOwnerOpeningBalanceReviewContext,
      authContext.requireOwnerCloseReadinessContext,
      authContext.requireOwnerCloseContext,
      authContext.requireOwnerStatementPublicationContext,
    ];
    const deniedContexts = [
      authContext.requireOwnerOpeningBalanceSubmissionContext,
      authContext.requireOwnerMonthReopenContext,
    ];

    expect(
      [...legacyContexts, ...deniedContexts].every(
        (context) => typeof context === "function",
      ),
    ).toBe(true);

    for (const requireContext of [...legacyContexts, ...deniedContexts]) {
      await expect(requireContext()).rejects.toThrow("REDIRECT:/no-access");
    }
    expect(mocks.redirect).toHaveBeenCalledWith("/no-access");
  });
});
