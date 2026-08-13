/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/marketing/request-actions", () => ({
  submitPublicInterestRequest: vi.fn(),
}));

import { PublicInterestForm } from "@/features/marketing/components/public-interest-form";

afterEach(cleanup);

describe("PublicInterestForm", () => {
  it("uses one native radio group for request intent", async () => {
    const user = userEvent.setup();
    render(<PublicInterestForm initialRequestType="information" />);

    const information = screen.getByRole("radio", {
      name: "Request information",
    }) as HTMLInputElement;
    const demo = screen.getByRole("radio", {
      name: "Request a demo",
    }) as HTMLInputElement;

    expect(information.checked).toBe(true);
    expect(demo.checked).toBe(false);

    await user.click(demo);

    expect(information.checked).toBe(false);
    expect(demo.checked).toBe(true);
    expect(screen.getByRole("button", { name: "Request a demo" })).not.toBeNull();
  });

  it("inherits the neutral semantic interaction surfaces used by the app", () => {
    render(<PublicInterestForm initialRequestType="information" />);

    const form = screen.getByRole("form", {
      name: "Request information or a demo",
    });
    const information = screen.getByRole("radio", {
      name: "Request information",
    });
    const demo = screen.getByRole("radio", { name: "Request a demo" });
    const submit = screen.getByRole("button", {
      name: "Request information",
    });

    expect(form.className).toContain("border-border");
    expect(form.className).toContain("bg-card");
    expect(information.closest("label")?.className).toContain("bg-primary");
    expect(demo.closest("label")?.className).toContain("hover:bg-muted");
    expect(submit.dataset.variant).toBe("default");
    expect(submit.className).not.toContain("--landing-cta");
  });

  it("uses concise labels without example text inside the entry fields", () => {
    render(<PublicInterestForm initialRequestType="information" />);

    const form = screen.getByRole("form", {
      name: "Request information or a demo",
    });

    expect(screen.getByRole("group", { name: /^Email/ })).not.toBeNull();
    expect(screen.queryByRole("group", { name: /^Work email/ })).toBeNull();

    for (const name of ["fullName", "workEmail", "companyName", "message"]) {
      expect(form.querySelector(`[name="${name}"]`)?.getAttribute("placeholder"))
        .toBeNull();
    }
  });
});
