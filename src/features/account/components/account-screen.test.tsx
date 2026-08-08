import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { signOutAction } from "@/features/auth/actions";
import { AccountScreen } from "@/features/account/components/account-screen";

const adminIdentity = {
  branchLabel: "All branches",
  email: "admin@example.com",
  organizationName: "Nestory Test",
  role: "super_admin" as const,
};

const linkedProfile = {
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  legalName: "Augusta Ada King",
  partyType: "individual",
  phone: "+66 81 234 5678",
  roles: ["staff", "owner"],
};

describe("AccountScreen", () => {
  it("presents four named regions on one flat divided surface", () => {
    const html = renderToStaticMarkup(
      <AccountScreen identity={adminIdentity} profile={linkedProfile} />,
    );

    expect(html).toMatch(/<main class="[^"]*divide-y[^"]*divide-border[^"]*">/);
    expect(html).toContain('role="region" aria-labelledby="account-profile-title"');
    expect(html).toContain('role="region" aria-labelledby="account-security-title"');
    expect(html).toContain('role="region" aria-labelledby="account-access-title"');
    expect(html).toContain('role="region" aria-labelledby="account-session-title"');
    expect(html).toContain('id="account-profile-title">');
    expect(html).toContain("Profile</h2>");
    expect(html).toContain("Security and sign-in</h2>");
    expect(html).toContain("Access scope</h2>");
    expect(html).toContain("Session</h2>");

    const sectionTags = html.match(/<section\b[^>]*>/g) ?? [];
    expect(sectionTags).toHaveLength(4);
    for (const sectionTag of sectionTags) {
      expect(sectionTag).not.toMatch(/rounded-md|bg-card(?:-raised)?|border border-border/);
    }
  });

  it("keeps profile, identity, access, and recovery facts read-only", () => {
    const html = renderToStaticMarkup(
      <AccountScreen identity={adminIdentity} profile={linkedProfile} />,
    );

    for (const value of [
      "Ada Lovelace",
      "Augusta Ada King",
      "Individual",
      "ada@example.com",
      "+66 81 234 5678",
      "Staff, Owner",
      "admin@example.com",
      "Nestory Test",
      "Admin",
      "Organization-wide",
      "Full workspace and settings access.",
      "Active session",
    ]) {
      expect(html).toContain(value);
    }
    expect(html).toContain("Use secure email recovery to create or replace your password.");
    expect(html).not.toContain("Save profile");
    expect(html).not.toContain("Edit profile");
  });

  it("limits links and mutations to recovery, admin access, and sign out", () => {
    const screen = AccountScreen({ identity: adminIdentity, profile: linkedProfile });
    const html = renderToStaticMarkup(screen);
    const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1]);
    const forms = findElements(screen, (element) => element.type === "form");

    expect(hrefs).toEqual(["/forgot-password", "/users-roles"]);
    expect(forms).toHaveLength(1);
    expect((forms[0].props as { action?: unknown }).action).toBe(signOutAction);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain("Sign out");
  });

  it("shows member scope without admin controls or obvious session narration", () => {
    const html = renderToStaticMarkup(
      <AccountScreen
        identity={{
          branchLabel: "BKK - Bangkok",
          email: "member@example.com",
          organizationName: "Nestory Test",
          role: "operations_member",
        }}
        profile={null}
      />,
    );

    expect(html).toContain("Access scope");
    expect(html).toContain("Assigned work");
    expect(html).not.toContain("Signing out ends this browser session.");
    expect(html).not.toContain("Workspace Access");
    expect(html).toContain("Set or change password");
    expect(html).toContain('href="/forgot-password"');
    expect(html).not.toContain("Delete account");
  });

  it("describes Finance roles as organization-wide and unlinked", () => {
    const html = renderToStaticMarkup(
      <AccountScreen
        identity={{
          branchLabel: "All branches",
          email: "finance@example.com",
          organizationName: "Nestory Test",
          role: "finance_manager",
        }}
        profile={null}
      />,
    );

    expect(html).toContain("Organization-wide");
    expect(html).toContain(
      "Organization-wide Finance read and expense review access.",
    );
    expect(html).not.toContain("Assigned task access");
  });

  it("shows the access-management link only for administrators", () => {
    const html = renderToStaticMarkup(
      <AccountScreen
        identity={adminIdentity}
        profile={null}
      />,
    );

    expect(html).toContain('href="/users-roles"');
    expect(html).toContain("Organization-wide");
    expect(html).toContain("Workspace Access");
    expect(html).toContain("Admin");
  });
});

function findElements(
  node: ReactNode,
  predicate: (element: ReactElement) => boolean,
): ReactElement[] {
  if (!isValidElement(node)) return [];

  const element = node as ReactElement<{ children?: ReactNode }>;
  const matches = predicate(element) ? [element] : [];
  const descendants = Children.toArray(element.props.children).flatMap((child) =>
    findElements(child, predicate),
  );
  return [...matches, ...descendants];
}
