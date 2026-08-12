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
});
