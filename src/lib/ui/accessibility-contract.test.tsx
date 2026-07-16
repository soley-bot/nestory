/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { LocalWorkspaceNav } from "@/components/layout/local-workspace-nav";
import { ModuleLoading } from "@/components/layout/module-loading";
import {
  CSV_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
import { RecordField } from "@/components/ui/record-form";
import { SideDrawer } from "@/components/ui/side-drawer";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { LoginForm } from "@/features/auth/components/login-form";

vi.mock("next/navigation", () => ({
  usePathname: () => "/properties",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/auth/actions", () => ({
  loginAction: vi.fn(),
  signOutAction: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("platform accessibility contract", () => {
  it("keeps the auth heading order and visible form labels intact", () => {
    render(
      <AuthPageShell description="Continue to your workspace." title="Sign in">
        <LoginForm />
      </AuthPageShell>,
    );

    const headings = screen.getAllByRole("heading");
    expect(headings[0]?.tagName).toBe("H1");
    expect(screen.getByRole("textbox", { name: "Email" })).not.toBeNull();
    expect(screen.getByLabelText("Password")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeNull();
  });

  it("gives every shell icon button a name and marks one current destination", () => {
    render(
      <AppShell role="admin">
        <div>Workspace</div>
      </AppShell>,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(
        button.getAttribute("aria-label") || button.textContent?.trim(),
      ).toBeTruthy();
    }

    for (const label of ["Global navigation", "Global mobile navigation"]) {
      const navigation = screen.getByRole("navigation", { name: label });
      expect(
        within(navigation)
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "page"),
      ).toHaveLength(1);
    }
  });

  it("keeps local selection semantic and native-keyboard reachable", () => {
    render(
      <LocalWorkspaceNav
        items={[
          { active: true, href: "/properties", label: "Properties" },
          { href: "/units", label: "Units" },
        ]}
        label="Property sections"
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Property sections",
    });
    const links = within(navigation).getAllByRole("link");
    expect(links.filter((link) => link.getAttribute("aria-current") === "page"))
      .toHaveLength(1);
    expect(links.every((link) => !link.hasAttribute("tabindex"))).toBe(true);
  });

  it("names drawers, traps focus, and returns focus to the opener", () => {
    render(<DrawerHarness />);
    const opener = screen.getByRole("button", { name: "Open record" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Edit property" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog.querySelector("aside"));

    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(screen.queryByRole("dialog", { name: "Edit property" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("associates inline errors with their controls", () => {
    render(
      <RecordField error="Property name is required." label="Property name" name="name" required>
        <input name="name" />
      </RecordField>,
    );

    const input = screen.getByRole("textbox", { name: /Property name/ });
    const error = screen.getByText("Property name is required.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
  });

  it("announces loading without exposing decorative skeletons", () => {
    const { container } = render(<ModuleLoading title="Properties" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("Properties is loading");
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThan(0);
  });

  it("keeps the file input outside its keyboard-operable drop action", () => {
    const { container } = render(
      <FileDropzoneField accept={CSV_FILE_ACCEPT} name="importFile" />,
    );
    const dropAction = screen.getByRole("button", {
      name: /Drop file here or browse/i,
    });
    const fileInput = container.querySelector("input[type='file']");

    expect(fileInput).not.toBeNull();
    expect(dropAction.contains(fileInput)).toBe(false);
  });
});

function DrawerHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open record
      </button>
      <SideDrawer
        description="Update the property record."
        onClose={() => setOpen(false)}
        open={open}
        title="Edit property"
      >
        <button type="button">Save property</button>
      </SideDrawer>
    </>
  );
}
