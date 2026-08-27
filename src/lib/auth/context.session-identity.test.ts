import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  from: vi.fn(),
  getClaims: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <Value>(operation: Value) => operation };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "localhost:3000" })),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { requireWorkspaceContext } from "@/lib/auth/context";

const sessionId = "30000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";

describe("workspace session identity", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockReset();
    mocks.from.mockReset();
    mocks.getClaims.mockReset();
    mocks.redirect.mockClear();

    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          branch_id: null,
          created_at: "2026-08-27T00:00:00.000Z",
          organization_id: "10000000-0000-4000-8000-000000000001",
          organizations: {
            accent_preset: "ocean",
            accent_seed: null,
            name: "Harbor Homes",
            slug: "harbor-homes",
            theme_mode: "light",
          },
          person_id: null,
          role: "super_admin",
        },
        error: null,
      }),
      order: vi.fn(),
      select: vi.fn(),
    };
    for (const method of ["eq", "limit", "order", "select"] as const) {
      query[method].mockReturnValue(query);
    }
    mocks.from.mockReturnValue(query);
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      from: mocks.from,
    });
  });

  it("carries the validated Auth session claim into workspace context", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          email: "admin@example.com",
          session_id: sessionId,
          sub: userId,
        },
      },
      error: null,
    });

    await expect(requireWorkspaceContext()).resolves.toMatchObject({
      sessionId,
      userEmail: "admin@example.com",
      userId,
    });
    expect(mocks.getClaims).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-session-uuid"],
  ])("fails closed when the session claim is %s", async (_label, claim) => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          email: "admin@example.com",
          ...(claim === undefined ? {} : { session_id: claim }),
          sub: userId,
        },
      },
      error: null,
    });

    await expect(requireWorkspaceContext()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
