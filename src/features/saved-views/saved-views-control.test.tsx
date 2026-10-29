// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavedViewsControl } from "./saved-views-control";
const fetchViews = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchViews); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); localStorage.clear(); });
it("loads personal views from the server on each device and dismisses with Escape", async () => {
  fetchViews.mockResolvedValue({ ok: true, json: async () => ({ scope: "org:user", views: [{ name: "Vacancies", query: "occupancy=unoccupied" }] }) });
  const user = userEvent.setup();
  const { unmount } = render(<SavedViewsControl resource="/units" scope="org:user" query="" />);
  await user.click(screen.getByRole("button", { name: "Saved views" }));
  expect((await screen.findByRole("link", { name: "Vacancies" })).getAttribute("href")).toBe("/units?occupancy=unoccupied");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("link", { name: "Vacancies" })).toBeNull();
  unmount();
  render(<SavedViewsControl resource="/units" scope="org:user" query="" />);
  await user.click(screen.getByRole("button", { name: "Saved views" }));
  await screen.findByRole("link", { name: "Vacancies" });
  expect(localStorage.length).toBe(0);
  expect(fetchViews).toHaveBeenCalledTimes(2);
});
it("keeps a failed save editable and never displays a success before persistence", async () => {
  fetchViews.mockResolvedValueOnce({ ok: true, json: async () => ({ scope: "org:user", views: [] }) });
  fetchViews.mockResolvedValue({ ok: false, json: async () => ({ error: "Try again." }) });
  const user = userEvent.setup();
  render(<SavedViewsControl resource="/units" scope="org:user" query="occupancy=unoccupied&action=create" />);
  await user.click(screen.getByRole("button", { name: "Saved views" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save current view" }).hasAttribute("disabled")).toBe(false));
  await user.type(screen.getByLabelText("View name"), "Vacancies");
  await user.click(screen.getByRole("button", { name: "Save current view" }));
  await screen.findByText("Try again.");
  expect((screen.getByLabelText("View name") as HTMLInputElement).value).toBe("Vacancies");
  expect(screen.queryByRole("link", { name: "Vacancies" })).toBeNull();
  expect(JSON.parse(fetchViews.mock.calls[1][1].body)).toMatchObject({ scope: "org:user", resource: "/units", query: "occupancy=unoccupied" });
});
it("rejects a response from a different signed-in workspace", async () => {
  fetchViews.mockResolvedValue({ ok: true, json: async () => ({ scope: "other:user", views: [{ name: "Private view", query: "" }] }) });
  render(<SavedViewsControl resource="/units" scope="org:user" query="" />);
  await userEvent.click(screen.getByRole("button", { name: "Saved views" }));
  await screen.findByText(/workspace changed/i);
  expect(screen.queryByText("Private view")).toBeNull();
});
it("uses only saved filters in the link immediately after a successful save", async () => {
  fetchViews.mockResolvedValue({ ok: true, json: async () => ({ scope: "org:user", views: [] }) });
  const user = userEvent.setup();
  render(<SavedViewsControl resource="/units" scope="org:user" query="occupancy=unoccupied&scope=operational&action=create&page=3" />);
  await user.click(screen.getByRole("button", { name: "Saved views" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save current view" }).hasAttribute("disabled")).toBe(false));
  await user.type(screen.getByLabelText("View name"), "Available units");
  await user.click(screen.getByRole("button", { name: "Save current view" }));
  expect((await screen.findByRole("link", { name: "Available units" })).getAttribute("href")).toBe("/units?occupancy=unoccupied&scope=operational");
});
