/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingHeader } from "@/features/marketing/components/landing-header";

const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  frames.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSections() {
  const view = render(<>
    <LandingHeader tone="hero" />
    <section id="workspace" tabIndex={-1}>Workspace target</section>
    <section id="operations" tabIndex={-1}>Operations target</section>
  </>);
  const workspace = screen.getByText("Workspace target");
  const operations = screen.getByText("Operations target");
  workspace.scrollIntoView = vi.fn();
  operations.scrollIntoView = vi.fn();
  return { ...view, workspace, operations };
}

function runFrames() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}

describe("LandingHeader", () => {
  it("focuses a section when arriving with a hash from another page", () => {
    window.history.replaceState(null, "", "/#operations");
    const { operations } = renderSections();
    runFrames();
    expect(document.activeElement).toBe(operations);
    expect(operations.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  it.each(["Workspace", "Operations"])("scrolls and focuses %s after the menu closes", async (label) => {
    const user = userEvent.setup();
    const targets = renderSections();
    const target = label === "Workspace" ? targets.workspace : targets.operations;
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: label }));
    await waitFor(() => expect(frames.size).toBe(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    runFrames();
    expect(window.location.hash).toBe(`#${label.toLowerCase()}`);
    expect(document.activeElement).toBe(target);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("supports keyboard selection of the current hash without adding history", async () => {
    window.history.replaceState(null, "", "/#workspace");
    const push = vi.spyOn(window.history, "pushState");
    const user = userEvent.setup();
    const { workspace } = renderSections();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    screen.getByRole("link", { name: "Workspace" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(frames.size).toBe(1));
    runFrames();
    expect(document.activeElement).toBe(workspace);
    expect(push).not.toHaveBeenCalled();
  });

  it("honors reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const user = userEvent.setup();
    const { operations } = renderSections();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: "Operations" }));
    await waitFor(() => expect(frames.size).toBe(1));
    runFrames();
    expect(operations.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  it("uses the history destination when traversal interrupts menu dismissal", async () => {
    const user = userEvent.setup();
    const { workspace, operations } = renderSections();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: "Workspace" }));
    act(() => {
      window.history.replaceState(null, "", "/#operations");
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => expect(frames.size).toBe(1));
    runFrames();
    expect(document.activeElement).toBe(operations);
    expect(workspace.scrollIntoView).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#operations");
  });

  it("cancels pending scrolling when the menu reopens or the header unmounts", async () => {
    const user = userEvent.setup();
    const { workspace, unmount } = renderSections();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("link", { name: "Workspace" }));
    await waitFor(() => expect(frames.size).toBe(1));
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    runFrames();
    expect(workspace.scrollIntoView).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    await user.click(screen.getByRole("link", { name: "Workspace" }));
    await waitFor(() => expect(frames.size).toBe(1));
    unmount();
    runFrames();
    expect(workspace.scrollIntoView).not.toHaveBeenCalled();
  });

  it("leaves modified link activation to the browser", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("link", { name: "Workspace" }), { ctrlKey: true });
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(frames.size).toBe(0);
  });

  it("uses the shared personal display-theme control", () => {
    render(<LandingHeader tone="hero" />);

    expect(screen.getByRole("button", { name: "Display theme" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Toggle color theme" })).toBeNull();
  });

  it("opens a focus-managed navigation dialog and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<LandingHeader tone="hero" />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Nestory navigation" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Landing page sections" })).toBeTruthy();

    const dialog = screen.getByRole("dialog", { name: "Nestory navigation" });
    expect(dialog.className).toContain("sm:max-w-none");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Nestory navigation" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
