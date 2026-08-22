/** @vitest-environment node */

import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { AccessSettingsScreen } from "@/features/organization/components/access-settings-screen";

describe("AccessSettingsScreen server rendering", () => {
  it("renders the closed invite drawer without browser globals", () => {
    expect(() =>
      renderToString(
        <AccessSettingsScreen
          branches={[]}
          invitations={[]}
          members={[]}
          people={[]}
          role="super_admin"
        />,
      ),
    ).not.toThrow();
  });
});
