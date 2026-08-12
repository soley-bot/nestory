import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/context", () => ({ requireUser: vi.fn() }));

import NoAccessPage from "@/app/no-access/page";

describe("NoAccessPage", () => {
  it("directs an unlinked account to Workspace Access", async () => {
    const html = renderToStaticMarkup(await NoAccessPage());

    expect(html).toContain("workspace administrator");
    expect(html).toContain("Workspace Access");
    expect(html).not.toContain("Users &amp; Roles");
  });

  it("keeps the unlinked wording when no reason is supplied", async () => {
    const html = renderToStaticMarkup(
      await NoAccessPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("not linked to this workspace");
    expect(html).toContain("Use another account");
  });

  it("tells a member who lacks a capability that only this area is closed", async () => {
    const html = renderToStaticMarkup(
      await NoAccessPage({ searchParams: Promise.resolve({ reason: "capability" }) }),
    );

    expect(html).toContain("do not have access to this area");
    expect(html).not.toContain("not linked to this workspace");
    expect(html).not.toContain("Use another account");
  });

  it("offers a member a route back into the workspace", async () => {
    const html = renderToStaticMarkup(
      await NoAccessPage({ searchParams: Promise.resolve({ reason: "capability" }) }),
    );

    expect(html).toContain('href="/workspace"');
    expect(html).toContain("Back to your workspace");
  });

  it("ignores an unrecognized reason rather than trusting it", async () => {
    const html = renderToStaticMarkup(
      await NoAccessPage({ searchParams: Promise.resolve({ reason: "anything-else" }) }),
    );

    expect(html).toContain("not linked to this workspace");
  });
});
