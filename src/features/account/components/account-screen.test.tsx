import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountScreen } from "@/features/account/components/account-screen";

describe("AccountScreen", () => {
  it("shows member scope and session consequence without admin controls", () => {
    const html = renderToStaticMarkup(
      <AccountScreen
        identity={{
          branchLabel: "BKK - Bangkok",
          email: "member@example.com",
          organizationName: "Nestory Test",
          role: "member",
        }}
        profile={null}
      />,
    );

    expect(html).toContain("Access scope");
    expect(html).toContain("Assigned work");
    expect(html).toContain("Signing out ends this browser session.");
    expect(html).not.toContain("Workspace Access");
    expect(html).not.toContain("Change password");
    expect(html).not.toContain("Delete account");
  });

  it("shows the access-management link only for administrators", () => {
    const html = renderToStaticMarkup(
      <AccountScreen
        identity={{
          branchLabel: "All branches",
          email: "admin@example.com",
          organizationName: "Nestory Test",
          role: "admin",
        }}
        profile={null}
      />,
    );

    expect(html).toContain('href="/users-roles"');
    expect(html).toContain("Organization-wide");
    expect(html).toContain("Workspace Access");
    expect(html).toContain("Administrator");
  });
});
