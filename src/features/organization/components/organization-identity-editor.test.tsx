/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateOrganizationIdentityAction } = vi.hoisted(() => ({
  updateOrganizationIdentityAction: vi.fn(),
}));

vi.mock("@/features/organization/actions", () => ({
  updateOrganizationIdentityAction,
}));

import { OrganizationIdentityEditor } from "@/features/organization/components/organization-identity-editor";

beforeEach(() => {
  updateOrganizationIdentityAction.mockReset();
  updateOrganizationIdentityAction.mockResolvedValue({
    message: "Workspace name updated.",
    status: "success",
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrganizationIdentityEditor", () => {
  it("keeps the workspace address locked while allowing the display name to change", async () => {
    const user = userEvent.setup();
    render(
      <OrganizationIdentityEditor
        branchCount={2}
        onDraftStatusChange={() => undefined}
        organizationName="Soley Property Management"
        teamCount={3}
        workspaceSetup={{
          operationalTimezone: "Asia/Phnom_Penh",
          preferredCurrency: "USD",
        }}
        workspaceUrl="https://spm.nestory-kh.com/"
      />,
    );

    expect(screen.getByText("spm.nestory-kh.com")).not.toBeNull();
    expect(screen.getByText(/locked after provisioning/i)).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: /workspace address/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();

    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await user.clear(input);
    await user.type(input, "Soley Residential Management");
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateOrganizationIdentityAction).toHaveBeenCalledOnce());
    const formData = updateOrganizationIdentityAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("name")).toBe("Soley Residential Management");
    expect(formData.get("slug")).toBeNull();
  });

  it("copies the locked workspace address with announced feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <OrganizationIdentityEditor
        branchCount={0}
        onDraftStatusChange={() => undefined}
        organizationName="Nestory Test"
        teamCount={0}
        workspaceSetup={{
          operationalTimezone: "UTC",
          preferredCurrency: "USD",
        }}
        workspaceUrl="https://nestory-test.nestory-kh.com/"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy workspace address" }));
    expect(writeText).toHaveBeenCalledWith("https://nestory-test.nestory-kh.com/");
    expect(await screen.findByText("Workspace address copied.")).not.toBeNull();
  });

  it("shows the immutable slug when a root domain is unavailable", () => {
    render(
      <OrganizationIdentityEditor
        branchCount={0}
        onDraftStatusChange={() => undefined}
        organizationName="Soley Property Management"
        organizationSlug="spm"
        teamCount={0}
        workspaceSetup={{
          operationalTimezone: "UTC",
          preferredCurrency: "USD",
        }}
        workspaceUrl="/"
      />,
    );

    expect(screen.getByText("spm")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Copy workspace address" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows stored currency and operational timezone as locked setup values", () => {
    render(
      <OrganizationIdentityEditor
        branchCount={0}
        onDraftStatusChange={() => undefined}
        organizationName="Soley Property Management"
        teamCount={0}
        workspaceSetup={{
          operationalTimezone: "Asia/Phnom_Penh",
          preferredCurrency: "USD",
        }}
        workspaceUrl="https://spm.nestory-kh.com/"
      />,
    );

    expect(screen.getByRole("heading", { name: "Workspace setup" })).not.toBeNull();
    expect(screen.getByText("Workspace currency")).not.toBeNull();
    expect(screen.getByText("USD")).not.toBeNull();
    expect(screen.getByText("Operational timezone")).not.toBeNull();
    expect(screen.getByText("Asia/Phnom_Penh")).not.toBeNull();
    expect(screen.getByText("Not editable in Settings")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /edit.*currency/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /edit.*timezone/i })).toBeNull();
  });
});
