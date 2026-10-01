/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/marketing/request-actions", () => ({
  submitPublicInterestRequest: vi.fn(),
}));

import { PublicInterestForm } from "@/features/marketing/components/public-interest-form";
import { submitPublicInterestRequest, type PublicInterestRequestState } from "@/features/marketing/request-actions";

afterEach(cleanup);

describe("PublicInterestForm", () => {
  it.each(["demo", "information"] as const)("keeps %s details after a failed submission", async (intent) => {
    vi.mocked(submitPublicInterestRequest).mockResolvedValue({
      status: "error",
      fieldErrors: { fullName: ["Enter your full name."] },
    });
    const user = userEvent.setup();
    render(<PublicInterestForm initialRequestType={intent} />);
    const fullName = screen.getByRole("textbox", { name: /^Full name/ }) as HTMLInputElement;
    const email = screen.getByRole("textbox", { name: /^Email/ }) as HTMLInputElement;
    const company = screen.getByRole("textbox", { name: /^Company/ }) as HTMLInputElement;
    fireEvent.change(fullName, { target: { value: "A" } });
    fireEvent.change(email, { target: { value: "landing-fixture@example.invalid" } });
    fireEvent.change(company, { target: { value: "Fixture Properties" } });
    await user.click(screen.getByRole("button", {
      name: intent === "demo" ? "Request a demo" : "Get information",
    }));
    await screen.findByText("Enter your full name.");
    expect(fullName.value).toBe("A");
    expect(email.value).toBe("landing-fixture@example.invalid");
    expect(company.value).toBe("Fixture Properties");
    await waitFor(() => expect(document.activeElement).toBe(fullName));
  });

  it("uses one native radio group for request intent", async () => {
    const user = userEvent.setup();
    render(<PublicInterestForm initialRequestType="information" />);

    const information = screen.getByRole("radio", {
      name: "Information",
    }) as HTMLInputElement;
    const demo = screen.getByRole("radio", {
      name: "Demo",
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
      name: "Information",
    });
    const demo = screen.getByRole("radio", { name: "Demo" });
    const submit = screen.getByRole("button", {
      name: "Get information",
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

  it("blocks repeat submissions while pending and shows confirmation only after the action succeeds", async () => {
    let finish!: (state: PublicInterestRequestState) => void;
    vi.mocked(submitPublicInterestRequest).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<PublicInterestForm initialRequestType="demo" />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Full name/ }), { target: { value: "Fixture Person" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "landing-fixture@example.invalid" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Company/ }), { target: { value: "Fixture Properties" } });
    await user.click(screen.getByRole("button", { name: "Request a demo" }));
    expect(screen.getByRole("form").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Sending request" }).closest("fieldset")?.disabled).toBe(true);
    expect(screen.queryByText("Thank you for your interest.")).toBeNull();
    finish({ status: "success", message: "Demo scheduling and account setup are arranged separately." });
    const confirmation = await screen.findByRole("status");
    await waitFor(() => expect(document.activeElement).toBe(confirmation));
    expect(screen.queryByRole("form")).toBeNull();
    expect(confirmation.textContent).not.toContain("queued");
  });

  it("keeps optional details and focuses a storage failure for retry", async () => {
    vi.mocked(submitPublicInterestRequest).mockResolvedValue({
      status: "error", message: "We could not save your request. Please try again.",
    });
    const user = userEvent.setup();
    render(<PublicInterestForm initialRequestType="information" />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Full name/ }), { target: { value: "Fixture Person" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "landing-fixture@example.invalid" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Company/ }), { target: { value: "Fixture Properties" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^How can we help/ }), { target: { value: "Show rent tracking." } });
    await user.click(screen.getByRole("button", { name: "Get information" }));
    await screen.findByText("Request not saved");
    expect((screen.getByRole("textbox", { name: /^How can we help/ }) as HTMLTextAreaElement).value).toBe("Show rent tracking.");
    expect(document.activeElement?.textContent).toContain("Request not saved");
    expect(screen.queryByText("Thank you for your interest.")).toBeNull();
  });
});
