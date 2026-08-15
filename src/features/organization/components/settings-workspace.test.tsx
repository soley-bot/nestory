/* @vitest-environment jsdom */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createBranchAction, createTeamAction, navigation, updateOrganizationAppearanceAction, updateOrganizationIdentityAction } = vi.hoisted(() => ({
  createBranchAction: vi.fn(),
  createTeamAction: vi.fn(),
  navigation: { push: vi.fn() },
  updateOrganizationAppearanceAction: vi.fn(),
  updateOrganizationIdentityAction: vi.fn(),
}));

vi.mock("@/features/organization/actions", () => ({
  createBranchAction,
  createTeamAction,
  updateOrganizationAppearanceAction,
  updateOrganizationIdentityAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

import { SettingsWorkspace } from "@/features/organization/components/settings-workspace";
import {
  cleanupSettingsWorkspaceTest,
  defaultSettingsWorkspaceProps as defaultProps,
  installSettingsWorkspaceDomStubs,
  renderSettingsPage,
  renderSettingsScreen,
} from "@/features/organization/components/settings-workspace-test-helpers";

beforeEach(() => {
  createBranchAction.mockReset();
  createTeamAction.mockReset();
  navigation.push.mockReset();
  installSettingsWorkspaceDomStubs();
});

afterEach(() => {
  cleanupSettingsWorkspaceTest();
});

describe("SettingsWorkspace navigation and layout", () => {
  it.each([
    ["organization", "Organization"],
    ["appearance", "Appearance"],
    ["branches", "Branches"],
    ["teams", "Teams"],
  ] as const)("renders %s content without a second navigation", (section, label) => {
    render(<SettingsWorkspace {...defaultProps} section={section} />);

    // Settings destinations now live in one row owned by SettingsTabs, so the
    // workspace itself carries no navigation of its own.
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);
    expect(
      screen.getByRole("region", { name: `${label} settings content` }),
    ).not.toBeNull();
  });

  it.each([
    ["organization", "Organization"],
    ["appearance", "Appearance"],
    ["branches", "Branches"],
    ["teams", "Teams"],
  ] as const)(
    "renders %s in one labelled current-content region",
    (section, label) => {
      render(<SettingsWorkspace {...defaultProps} section={section} />);

      const workspace = screen.getByTestId("settings-workspace");

      expect(within(workspace).queryAllByRole("navigation")).toHaveLength(0);
      expect(within(workspace).getAllByRole("region")).toHaveLength(1);
      expect(
        within(workspace).getByRole("region", {
          name: `${label} settings content`,
        }),
      ).not.toBeNull();
    },
  );

  it.each([
    ["appearance", "Set the workspace default theme and accent."],
    ["branches", "Organize properties and Operations access by location."],
    ["teams", "Group staff for clear operating responsibility."],
  ] as const)("explains the purpose of %s settings", (section, description) => {
    render(<SettingsWorkspace {...defaultProps} section={section} />);

    expect(screen.getByText(description)).not.toBeNull();
  });

  it("gives settings content the full width on the page gutter", () => {
    render(<SettingsWorkspace {...defaultProps} section="organization" />);

    const workspace = screen.getByTestId("settings-workspace");

    // The 180px rail and the bespoke max-w-6xl container are gone: content
    // spans the page and shares the gutter every other route uses.
    expect(workspace.className).not.toContain("grid-cols");
    expect(workspace.className).not.toContain("max-w-6xl");
    expect(workspace.className).not.toContain("workspace-gutter-x");
    expect(workspace.className).toContain("min-w-0");
    expect(screen.getByTestId("settings-current-content").className).toContain(
      "min-w-0",
    );
    expect(screen.queryByTestId("settings-summary")).toBeNull();
  });

  it("shows editable organization identity with a locked workspace address", () => {
    render(<SettingsWorkspace {...defaultProps} section="organization" />);

    expect(
      screen.getByRole("heading", { name: "Organization" }),
    ).not.toBeNull();
    expect(
      (screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement)
        .value,
    ).toBe("Nestory Test");
    expect(screen.getByText("nestory-test.nestory-kh.com")).not.toBeNull();
    const content = screen.getByTestId("settings-current-content");
    expect(within(content).getByText("Branches")).not.toBeNull();
    expect(within(content).getByText("Teams")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Workspace name" })).not.toBeNull();
  });

  it.each([
    ["branches", "Teams", "/settings/teams"],
    ["teams", "Branches", "/settings/branches"],
  ] as const)(
    "guards a dirty %s draft on a real section link and navigates once after confirmation",
    async (section, destinationLabel, destinationHref) => {
      const user = userEvent.setup();
      renderSettingsPage(section);

      if (section === "branches") {
        await openBranchDrawer(user);
      } else {
        await openTeamDrawer(user);
      }
      const name = screen.getByRole("textbox", { name: "Name" });
      const destination = screen.getByRole("link", {
        hidden: true,
        name: destinationLabel,
      });
      await user.type(name, "Pending draft");
      fireEvent.click(destination);

      expect(navigation.push).not.toHaveBeenCalled();
      expect((name as HTMLInputElement).value).toBe("Pending draft");
      expect(
        screen.getByRole("dialog", {
          hidden: true,
          name: `Open ${destinationLabel}?`,
        }),
      ).not.toBeNull();
      expect(
        screen.getByTestId("settings-navigation-actions").className,
      ).toContain("grid");
      expect(
        screen
          .getByRole("button", {
            hidden: true,
            name: `Discard and open ${destinationLabel}`,
          })
          .className.includes("w-full"),
      ).toBe(true);

      fireEvent.click(
        screen.getByRole("button", { hidden: true, name: "Keep editing" }),
      );
      expect(
        screen.queryByRole("dialog", {
          hidden: true,
          name: `Open ${destinationLabel}?`,
        }),
      ).toBeNull();
      expect((name as HTMLInputElement).value).toBe("Pending draft");

      fireEvent.click(destination);
      fireEvent.click(
        screen.getByRole("button", {
          hidden: true,
          name: `Discard and open ${destinationLabel}`,
        }),
      );

      expect(navigation.push).toHaveBeenCalledOnce();
      expect(navigation.push).toHaveBeenCalledWith(destinationHref);
      expect((name as HTMLInputElement).value).toBe("");
    },
  );

  it("keeps a clean section link as ordinary navigation without a discard prompt", async () => {
    const user = userEvent.setup();
    renderSettingsPage("branches");

    await user.click(screen.getByRole("link", { hidden: true, name: "Teams" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("focuses the outer navigation confirmation, blocks the background, and restores its trigger", async () => {
    const user = userEvent.setup();
    renderSettingsScreen("teams");

    await openTeamDrawer(user);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Pending");
    const destination = screen.getByRole("link", {
      hidden: true,
      name: "Branches",
    });
    const backgroundLink = screen.getByRole("link", {
      hidden: true,
      name: "Organization",
    });
    fireEvent.click(destination);

    const dialog = screen.getByRole("dialog", {
      hidden: true,
      name: "Open Branches?",
    });
    const keepEditing = within(dialog).getByRole("button", {
      hidden: true,
      name: "Keep editing",
    });
    const background = screen.getByTestId("settings-navigation-background");

    expect(document.activeElement).not.toBe(backgroundLink);
    expect(background.hasAttribute("inert")).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(backgroundLink);
    expect(
      screen.getByRole("dialog", { hidden: true, name: "Open Branches?" }),
    ).not.toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(keepEditing);
    expect(
      screen.queryByRole("dialog", { hidden: true, name: "Open Branches?" }),
    ).toBeNull();
    expect(background.hasAttribute("inert")).toBe(false);
    expect(background.hasAttribute("aria-hidden")).toBe(false);
  });

  it("guards the adjacent Access tab with the same draft confirmation", async () => {
    const user = userEvent.setup();
    renderSettingsScreen("branches");

    await openBranchDrawer(user);
    const name = screen.getByRole("textbox", { name: "Name" });
    const destination = screen.getByRole("link", {
      hidden: true,
      name: "Access",
    });
    await user.type(name, "Pending branch");
    fireEvent.click(destination);

    expect(navigation.push).not.toHaveBeenCalled();
    expect((name as HTMLInputElement).value).toBe("Pending branch");
    expect(
      screen.getByRole("dialog", {
        hidden: true,
        name: "Open Access?",
      }),
    ).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { hidden: true, name: "Keep editing" }),
    );
    expect((name as HTMLInputElement).value).toBe("Pending branch");
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(destination);
    fireEvent.click(
      screen.getByRole("button", {
        hidden: true,
        name: "Discard and open Access",
      }),
    );

    expect(navigation.push).toHaveBeenCalledOnce();
    expect(navigation.push).toHaveBeenCalledWith("/settings/access");
    expect((name as HTMLInputElement).value).toBe("");
  });

  it("keeps a clean Access tab as a native Link", async () => {
    renderSettingsScreen("branches");

    fireEvent.click(
      screen.getByRole("link", { hidden: true, name: "Access" }),
    );

    expect(
      screen.queryByRole("dialog", {
        hidden: true,
        name: "Open Access?",
      }),
    ).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("completes one pending outer-tab navigation after an in-flight save succeeds", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message: string; status: "success" }>();
    createBranchAction.mockReturnValueOnce(pending.promise);
    renderSettingsScreen("branches");

    await openBranchDrawer(user);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), "HKT");
    await user.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(
      screen.getByRole("link", { hidden: true, name: "Access" }),
    );

    expect(
      screen.getByText(
        "A save is still in progress. Stay on this section until it finishes.",
      ),
    ).not.toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();

    pending.resolve({ message: "Branch added.", status: "success" });

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledOnce();
    });
    expect(navigation.push).toHaveBeenCalledWith("/settings/access");
    expect(
      screen.queryByRole("dialog", {
        hidden: true,
        name: "Open Access?",
      }),
    ).toBeNull();
    expect(screen.queryByText(/save is still in progress/i)).toBeNull();
  });

  it("closes pending navigation and focuses the sole visible error after an in-flight save fails", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message: string; status: "error" }>();
    createBranchAction.mockReturnValueOnce(pending.promise);
    renderSettingsScreen("branches");

    await openBranchDrawer(user);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), "HKT");
    await user.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("link", { hidden: true, name: "Teams" }));

    pending.resolve({
      message: "That code or branch name is already in use.",
      status: "error",
    });

    const alert = await screen.findByRole("alert");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { hidden: true, name: "Open Teams?" }),
      ).toBeNull();
      expect(document.activeElement).toBe(alert);
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alert.textContent).toContain(
      "Branch not saved: That code or branch name is already in use.",
    );
    expect(screen.queryByText(/save is still in progress/i)).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("restores the outer trigger when an existing error draft cancels navigation", async () => {
    const user = userEvent.setup();
    createBranchAction.mockResolvedValueOnce({
      message: "That code or branch name is already in use.",
      status: "error",
    });
    renderSettingsScreen("branches");

    await openBranchDrawer(user);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), "HKT");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(document.activeElement).toBe(alert);

    const destination = screen.getByRole("link", {
      hidden: true,
      name: "Access",
    });
    fireEvent.click(destination);
    expect(
      screen.getByRole("dialog", {
        hidden: true,
        name: "Open Access?",
      }),
    ).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { hidden: true, name: "Keep editing" }),
    );

    expect(
      screen.queryByRole("dialog", {
        hidden: true,
        name: "Open Access?",
      }),
    ).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}


async function openBranchDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add branch" }));
  return screen.getByRole("dialog", { name: "Add branch" });
}

async function openTeamDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add team" }));
  return screen.getByRole("dialog", { name: "Add team" });
}
