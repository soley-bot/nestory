/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addAccess, updateAccess } = vi.hoisted(() => ({
  addAccess: vi.fn(),
  updateAccess: vi.fn(),
}));

vi.mock("@/features/organization/actions", () => ({
  addExistingUserAccessAction: addAccess,
  updateMemberAccessAction: updateAccess,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { AccessSettingsScreen } from "@/features/organization/components/access-settings-screen";

const branch = {
  address: "12 River Road",
  code: "BKK",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Bangkok",
  status: "active",
};

const person = {
  id: "22222222-2222-4222-8222-222222222222",
  label: "Mina Chen",
};

const admin = {
  branchId: null,
  email: "admin@example.com",
  id: "33333333-3333-4333-8333-333333333333",
  personId: person.id,
  role: "admin" as const,
  userId: "44444444-4444-4444-8444-444444444444",
};

beforeEach(() => {
  addAccess.mockReset();
  updateAccess.mockReset();
  addAccess.mockResolvedValue({ status: "success", message: "User access added." });
  updateAccess.mockResolvedValue({ status: "success", message: "Access updated." });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

describe("AccessSettingsScreen", () => {
  it("replaces role tutorials with a compact access workspace", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add access" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    expect(screen.getByText("1 active member")).toBeTruthy();
    expect(screen.queryByText(/Full workspace access, settings/i)).toBeNull();
  });

  it("shows effective scope and staff linkage beside each member", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );

    const member = screen.getByTestId(`access-member-${admin.id}`);
    expect(within(member).getByText("Active membership")).toBeTruthy();
    expect(within(member).getByText("Organization-wide")).toBeTruthy();
    expect(within(member).getAllByText("Mina Chen").length).toBeGreaterThan(0);
    expect(within(member).getByText("Full workspace access")).toBeTruthy();
  });

  it("starts clean and exposes the authoritative last-admin protection", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );

    const member = screen.getByTestId(`access-member-${admin.id}`);
    expect(
      (within(member).getByRole("button", { name: "Save access" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(member).getByText("Last administrator")).toBeTruthy();
    expect(
      within(member).getByText(/another administrator is required before this role can be reduced/i),
    ).toBeTruthy();
  });

  it("uses visible form labels and one primary add action", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = screen.getByTestId("add-access-form");
    expect(within(addForm).getByLabelText("Email")).toBeTruthy();
    expect(within(addForm).getAllByText("Role").length).toBeGreaterThan(0);
    expect(within(addForm).getAllByText("Scope").length).toBeGreaterThan(0);
    expect(
      (within(addForm).getByRole("button", { name: "Add access" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps a trusted invite handoff actionable without retyping", () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "new@example.com", personId: person.id }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = screen.getByTestId("add-access-form");
    expect((within(addForm).getByLabelText("Email") as HTMLInputElement).value).toBe("new@example.com");
    expect(
      (within(addForm).getByRole("button", { name: "Add access" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("discards a trusted invite handoff back to an empty access draft", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        inviteDefaults={{ email: "new@example.com", personId: person.id }}
        members={[admin]}
        people={[person]}
      />,
    );

    const addForm = screen.getByTestId("add-access-form");
    await user.click(within(addForm).getByRole("button", { name: "Discard" }));
    await user.click(within(addForm).getByRole("button", { name: "Discard changes" }));

    expect((within(addForm).getByLabelText("Email") as HTMLInputElement).value).toBe("");
    expect(
      (within(addForm).getByRole("button", { name: "Add access" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("focuses the invalid email and announces one actionable error", async () => {
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    const email = within(addForm).getByLabelText("Email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add access" }));

    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(within(addForm).getAllByRole("alert")).toHaveLength(1);
    expect(within(addForm).getByText("Enter a valid email.")).toBeTruthy();
    expect(addAccess).not.toHaveBeenCalled();
  });

  it("locks a non-idempotent add synchronously and focuses a server error", async () => {
    let resolveAction: (value: { status: "error"; message: string }) => void = () => undefined;
    addAccess.mockImplementation(
      () => new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    fireEvent.change(within(addForm).getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    const save = within(addForm).getByRole("button", { name: "Add access" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(addAccess).toHaveBeenCalledTimes(1);
    resolveAction({ status: "error", message: "Invite could not be sent." });
    const alert = await within(addForm).findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toContain("Invite could not be sent.");
  });

  it("freezes access fields while their submitted snapshot is saving", async () => {
    let resolveAction: (value: { status: "success"; message: string }) => void = () => undefined;
    addAccess.mockImplementation(
      () => new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const addForm = screen.getByTestId("add-access-form");
    const email = within(addForm).getByLabelText("Email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "new@example.com" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add access" }));

    expect(email.disabled).toBe(true);
    expect(
      (within(addForm).getByRole("combobox", { name: "Role" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    resolveAction({ status: "success", message: "User access added." });
    expect(await within(addForm).findByText("User access added.")).toBeTruthy();
  });

  it("turns a pending navigation into a dirty decision when another draft remains", async () => {
    const user = userEvent.setup();
    let resolveAction: (value: { status: "success"; message: string }) => void = () => undefined;
    addAccess.mockImplementation(
      () => new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    const otherAdmin = {
      ...admin,
      email: "other@example.com",
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    };
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin, otherAdmin]}
        people={[person]}
      />,
    );

    const member = screen.getByTestId(`access-member-${admin.id}`);
    await user.click(within(member).getByRole("combobox", { name: "Role" }));
    await user.click(screen.getByRole("option", { name: "Manager" }));
    const addForm = screen.getByTestId("add-access-form");
    fireEvent.change(within(addForm).getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add access" }));
    await user.click(screen.getByRole("link", { name: "Workspace" }));
    expect(screen.getByRole("dialog").textContent).toContain("save is still in progress");

    resolveAction({ status: "success", message: "User access added." });
    await waitFor(() => {
      expect(screen.getByRole("dialog").textContent).toContain("unsaved changes");
    });
    expect(screen.getByRole("button", { name: "Discard and open Workspace" })).toBeTruthy();
  });

  it("guards the Workspace link while an add draft is dirty and restores its focus", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    const workspace = screen.getByRole("link", { name: "Workspace" });
    await user.click(workspace);

    expect(screen.getByRole("dialog").textContent).toContain("unsaved changes");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(document.activeElement).toBe(workspace));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("new@example.com");
  });

  it("blocks a last-admin demotion beside the changed role control", async () => {
    const user = userEvent.setup();
    render(
      <AccessSettingsScreen
        branches={[branch]}
        members={[admin]}
        people={[person]}
      />,
    );
    const member = screen.getByTestId(`access-member-${admin.id}`);
    await user.click(within(member).getByRole("combobox", { name: "Role" }));
    await user.click(screen.getByRole("option", { name: "Manager" }));

    expect(
      (within(member).getByRole("button", { name: "Save access" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(member).getByText("Add another administrator before changing this role.")).toBeTruthy();
    expect(within(member).getByText(/Operational access/)).toBeTruthy();
  });

  it("submits the exact member access boundary when another admin remains", async () => {
    const user = userEvent.setup();
    const otherAdmin = {
      ...admin,
      email: "other@example.com",
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    };
    render(
      <StrictMode>
        <AccessSettingsScreen
          branches={[branch]}
          members={[admin, otherAdmin]}
          people={[person]}
        />
      </StrictMode>,
    );
    const member = screen.getByTestId(`access-member-${admin.id}`);
    await user.click(within(member).getByRole("combobox", { name: "Role" }));
    await user.click(screen.getByRole("option", { name: "Manager" }));
    fireEvent.click(within(member).getByRole("button", { name: "Save access" }));

    await waitFor(() => expect(updateAccess).toHaveBeenCalledTimes(1));
    const submitted = updateAccess.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(submitted.entries())).toEqual({
      branchId: "",
      memberId: admin.id,
      personId: person.id,
      role: "manager",
    });
    expect(await within(member).findByText("Access updated.")).toBeTruthy();
  });
});
