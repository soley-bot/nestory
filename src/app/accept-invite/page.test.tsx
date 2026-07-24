import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getInvitationAcceptance } = vi.hoisted(() => ({
  getInvitationAcceptance: vi.fn(),
}));

vi.mock("@/features/auth/invitation-acceptance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/invitation-acceptance")>()),
  getInvitationAcceptance,
}));

import AcceptInvitePage from "@/app/accept-invite/page";

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    getInvitationAcceptance.mockReset();
    getInvitationAcceptance.mockResolvedValue({
      accountEmail: "mara@example.com",
      expiresAt: "2026-07-23T12:00:00.000Z",
      invitationId: "11111111-1111-4111-8111-111111111111",
      organizationName: "Riverside Operations",
      passwordRequired: false,
      role: "member",
      scopeName: "Bangkok",
      staffName: "Mara Chen",
      state: "pending",
    });
  });

  it("uses Workspace Access labels when reviewing an invitation", async () => {
    const html = renderToStaticMarkup(
      await AcceptInvitePage({
        searchParams: Promise.resolve({ invitation: "11111111-1111-4111-8111-111111111111" }),
      }),
    );

    expect(html).toContain("Access level");
    expect(html).toContain("Access scope");
    expect(html).toContain("Linked staff record");
    expect(html).toContain("Member");
    expect(html).not.toContain("Team Member");
  });
});
