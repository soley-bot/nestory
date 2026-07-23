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
});
