/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsTabs } from "@/components/layout/settings-tabs";

afterEach(cleanup);

describe("SettingsTabs", () => {
  it.each(["/settings", "/users-roles"])(
    "keeps exactly one current section for %s",
    (activeHref) => {
      render(<SettingsTabs activeHref={activeHref} />);

      const navigation = screen.getByRole("navigation", {
        name: "Settings sections",
      });
      const links = within(navigation).getAllByRole("link");
      const current = links.filter(
        (link) => link.getAttribute("aria-current") === "page",
      );

      expect(links.map((link) => link.textContent)).toEqual([
        "Workspace",
        "Workspace Access",
      ]);
      expect(current).toHaveLength(1);
      expect(current[0]?.getAttribute("href")).toBe(activeHref);
      expect(
        links.every((link) =>
          link.className.includes("focus-visible:ring-focus-ring"),
        ),
      ).toBe(true);
    },
  );
});
