/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/marketing/request-actions", () => ({
  submitPublicInterestRequest: vi.fn(),
}));

import RequestPage from "@/app/request/page";

afterEach(cleanup);

describe("RequestPage", () => {
  it("keeps public request interactions and supporting accents neutral", async () => {
    render(
      await RequestPage({
        searchParams: Promise.resolve({ intent: "information" }),
      }),
    );

    const themeControl = screen.getByRole("button", { name: "Display theme" });
    const eyebrow = screen.getByText("Managed access");
    const signIn = screen.getByRole("link", {
      name: "Sign in to your workspace",
    });
    const firstNote = screen.getByText(
      "A guided look at the operating record, not a generic product tour",
    );

    expect(themeControl.className).toContain("focus-visible:ring-ring/50");
    expect(themeControl.className).not.toContain("--landing-accent");
    expect(eyebrow.className).toContain("text-muted-foreground");
    expect(signIn.className).toContain("text-foreground");
    expect(firstNote.parentElement?.querySelector("svg")?.getAttribute("class"))
      .toContain("text-muted-foreground");
  });
});
