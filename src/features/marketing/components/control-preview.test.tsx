/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ControlPreview } from "@/features/marketing/components/control-preview";

afterEach(cleanup);

describe("ControlPreview", () => {
  it("uses the current dashboard workspace instead of maintaining a separate replica", () => {
    render(<ControlPreview />);

    const preview = screen.getByRole("region", { name: "Current dashboard preview" });
    const dashboard = within(preview).getByRole("region", {
      name: "Portfolio operating work",
    });

    expect(within(dashboard).getByRole("heading", { name: "Portfolio cash flow" })).toBeTruthy();
    expect(within(dashboard).getByRole("heading", { name: "Properties" })).toBeTruthy();
    expect(preview.querySelector("[inert]")).not.toBeNull();
  });

  it("shows the same compact attention entry point as the current dashboard", () => {
    render(<ControlPreview />);

    const preview = screen.getByRole("region", { name: "Current dashboard preview" });

    expect(within(preview).getByRole("region", { name: "Portfolio metrics" })).toBeTruthy();
    expect(within(preview).getByRole("button", { name: "Needs attention, 9 open checks" })).toBeTruthy();
    expect(within(preview).queryByRole("table", { name: "Attention queue" })).toBeNull();
  });
});
