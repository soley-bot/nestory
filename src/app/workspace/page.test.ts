import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireWorkspaceContext } = vi.hoisted(() => ({
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext }));

import WorkspacePage from "@/app/workspace/page";

describe("WorkspacePage", () => {
  beforeEach(() => {
    requireWorkspaceContext.mockReset();
  });

  it.each([
    ["admin", "/overview"],
    ["manager", "/maintenance"],
    ["member", "/tasks"],
  ] as const)("links %s users to %s", async (role, expectedPath) => {
    requireWorkspaceContext.mockResolvedValue({
      organizationName: "Riverside Operations",
      role,
    });

    const html = renderToStaticMarkup(await WorkspacePage());

    expect(html).toContain(`href="${expectedPath}"`);
    expect(html).toContain("Open workspace");
  });

  it("renders concise organization and role context without a second dashboard shell", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationName: "Riverside Operations",
      role: "manager",
    });

    const html = renderToStaticMarkup(await WorkspacePage());

    expect(requireWorkspaceContext).toHaveBeenCalledOnce();
    expect(html).toContain("Riverside Operations");
    expect(html).toContain("Manager workspace");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html.match(/<button\b/g) ?? []).toHaveLength(1);
    expect(html).toContain('aria-label="Toggle color theme"');
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("Dashboard");
  });

  it("renders the approved cinematic workspace arrival composition", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationName: "Riverside Operations",
      role: "admin",
    });

    const html = renderToStaticMarkup(await WorkspacePage());

    expect(html).toContain("workspace-arrival-page");
    expect(html).toContain("workspace-arrival-image");
    expect(html).toContain("workspace-arrival-scrim");
    expect(html).toContain("workspace-arrival-card");
    expect(html).toContain("<header");
    expect(html).toContain("login-property-building-blue-hour.png");
    expect(html).toContain('alt=""');
    expect(html).toContain(
      "shadow-[inset_0_0_0_1px_var(--workspace-arrival-action-border)]",
    );
    expect(html).toContain(
      "bg-[var(--workspace-arrival-action)] px-4 text-sm",
    );
    expect(html).not.toContain(
      "border border-[var(--workspace-arrival-action-border)]",
    );
    expect(html).not.toContain("px-[15px]");
    expect(html).toContain("transition-colors");
    expect(html).not.toContain("hover:-translate-y-0.5");
    expect(html).not.toContain("transition-[transform,background-color]");
  });
});
