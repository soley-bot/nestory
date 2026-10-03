/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SettingsTabs } from "./settings-tabs";
afterEach(cleanup);
it("keeps the compatibility export on the single grouped navigation", () => {
  render(<SettingsTabs activeHref="/settings/access" role="super_admin" />);
  expect(screen.getAllByRole("navigation")).toHaveLength(1);
  expect(screen.getAllByRole("link")).toHaveLength(6);
  expect(screen.getByRole("link", { name: "Access" }).getAttribute("aria-current")).toBe("page");
});
