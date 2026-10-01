/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/marketing/request-actions", () => ({
  submitPublicInterestRequest: vi.fn(),
}));

import RequestPage from "@/app/request/page";

afterEach(cleanup);

describe("RequestPage", () => {
  it("updates the selected intent when navigating between request URLs", async () => {
    const { rerender } = render(await RequestPage({
      searchParams: Promise.resolve({ intent: "information" }),
    }));
    expect((screen.getByRole("radio", { name: "Information" }) as HTMLInputElement).checked).toBe(true);
    rerender(await RequestPage({ searchParams: Promise.resolve({ intent: "demo" }) }));
    expect((screen.getByRole("radio", { name: "Demo" }) as HTMLInputElement).checked).toBe(true);
  });

  it("keeps public request interactions and supporting accents neutral", async () => {
    render(
      await RequestPage({
        searchParams: Promise.resolve({ intent: "information" }),
      }),
    );

    const themeControl = screen.getByRole("button", { name: "Display theme" });
    const heading = screen.getByRole("heading", { name: "Talk to Nestory." });
    const signIn = screen.getAllByRole("link", { name: "Sign in" }).at(-1);

    expect(themeControl.className).toContain("focus-visible:ring-ring/50");
    expect(themeControl.className).not.toContain("--landing-accent");
    expect(heading).not.toBeNull();
    expect(signIn?.className).toContain("text-foreground");
  });
});
