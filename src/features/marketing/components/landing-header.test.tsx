/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { LandingHeader } from "@/features/marketing/components/landing-header";

afterEach(cleanup);

describe("LandingHeader", () => {
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

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Nestory navigation" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
