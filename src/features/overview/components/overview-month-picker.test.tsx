// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OverviewMonthPicker } from "./overview-month-picker";
afterEach(cleanup);
it("disables months before reporting starts while keeping valid months navigable", () => {
  render(<OverviewMonthPicker financialStartDate="2026-10-01" query={{ financeView: "collections", lens: "all", month: "2026-10", propertyId: "all", review: "all" }} />);
  fireEvent.click(screen.getByRole("button", { name: /Change reporting month/ }));
  expect(screen.queryByRole("link", { name: "Sep" })).toBeNull();
  expect(screen.getByRole("button", { name: "Sep" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Previous year" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("link", { name: "Oct" }).getAttribute("href")).toContain("month=2026-10");
});
