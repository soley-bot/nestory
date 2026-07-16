import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { accountScreenSpy, requireWorkspaceContext } = vi.hoisted(() => ({
  accountScreenSpy: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));
vi.mock("@/features/account/components/account-screen", () => ({
  AccountScreen: (props: Record<string, unknown>) => {
    accountScreenSpy(props);
    return <div>Focused account screen</div>;
  },
}));

import AccountPage from "@/app/(dashboard)/account/page";

describe("AccountPage", () => {
  beforeEach(() => {
    accountScreenSpy.mockReset();
    requireWorkspaceContext.mockReset();
  });

  it("passes only the current member identity and scope into the account screen", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      role: "member",
      userEmail: "member@example.com",
      userId: "user-1",
    });

    const html = renderToStaticMarkup(await AccountPage());

    expect(html).toContain("Focused account screen");
    expect(accountScreenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          email: "member@example.com",
          organizationName: "Nestory Test",
          role: "member",
        }),
      }),
    );
    expect(accountScreenSpy.mock.calls[0][0]).not.toHaveProperty("members");
  });
});
