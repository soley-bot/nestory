import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/workspace-search/route";
import { searchWorkspace } from "@/features/workspace-search/data/workspace-search";
import {
  getCurrentUser,
  getWorkspaceMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/features/workspace-search/data/workspace-search", () => ({
  searchWorkspace: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  getCurrentUser: vi.fn(),
  getWorkspaceMembershipForUser: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("GET /api/workspace-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" });
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue({
      branchId: "branch-a",
      organizationId: "org-1",
      organizationName: "Nestory",
      personId: "person-1",
      role: "manager",
    });
    vi.mocked(searchWorkspace).mockResolvedValue([
      {
        href: "/maintenance?archiveState=all&taskId=task-1",
        id: "task-1",
        kind: "maintenance",
        label: "Boiler leak",
      },
    ]);
  });

  it("returns a clean private 401 without touching the database when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/workspace-search?q=boiler"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(searchWorkspace).not.toHaveBeenCalled();
  });

  it("derives organization and role from the signed-in membership", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/workspace-search?q=%20%20boiler%20%20&organizationId=org-evil&role=admin",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(getWorkspaceMembershipForUser).toHaveBeenCalledWith(
      "user-1",
      expect.anything(),
    );
    expect(searchWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          branchId: "branch-a",
          organizationId: "org-1",
          personId: "person-1",
          role: "manager",
        },
        query: "boiler",
      }),
    );
    expect(await response.json()).toEqual({
      results: [expect.objectContaining({ id: "task-1" })],
    });
  });

  it("returns forbidden when the signed-in user has no workspace membership", async () => {
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/workspace-search?q=boiler"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(searchWorkspace).not.toHaveBeenCalled();
  });
});
