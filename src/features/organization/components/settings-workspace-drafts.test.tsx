/* @vitest-environment jsdom */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  archiveOrganizationBranchAction,
  archiveOrganizationTeamAction,
  createBranchAction,
  createTeamAction,
  navigation,
  restoreOrganizationBranchAction,
  restoreOrganizationTeamAction,
  updateOrganizationBranchAction,
  updateOrganizationTeamAction,
  updateOrganizationAppearanceAction,
} = vi.hoisted(() => ({
  archiveOrganizationBranchAction: vi.fn(),
  archiveOrganizationTeamAction: vi.fn(),
  createBranchAction: vi.fn(),
  createTeamAction: vi.fn(),
  navigation: { push: vi.fn() },
  restoreOrganizationBranchAction: vi.fn(),
  restoreOrganizationTeamAction: vi.fn(),
  updateOrganizationBranchAction: vi.fn(),
  updateOrganizationTeamAction: vi.fn(),
  updateOrganizationAppearanceAction: vi.fn(),
}));

vi.mock("@/features/organization/actions", () => ({
  archiveOrganizationBranchAction,
  archiveOrganizationTeamAction,
  createBranchAction,
  createTeamAction,
  restoreOrganizationBranchAction,
  restoreOrganizationTeamAction,
  updateOrganizationBranchAction,
  updateOrganizationTeamAction,
  updateOrganizationAppearanceAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

import { SettingsWorkspace } from "@/features/organization/components/settings-workspace";
import {
  cleanupSettingsWorkspaceTest,
  defaultSettingsWorkspaceProps as defaultProps,
  installSettingsWorkspaceDomStubs,
} from "@/features/organization/components/settings-workspace-test-helpers";

beforeEach(() => {
  archiveOrganizationBranchAction.mockReset();
  archiveOrganizationTeamAction.mockReset();
  createBranchAction.mockReset();
  createTeamAction.mockReset();
  navigation.push.mockReset();
  restoreOrganizationBranchAction.mockReset();
  restoreOrganizationTeamAction.mockReset();
  updateOrganizationBranchAction.mockReset();
  updateOrganizationTeamAction.mockReset();
  installSettingsWorkspaceDomStubs();
});

afterEach(() => {
  cleanupSettingsWorkspaceTest();
});

describe("SettingsWorkspace drafts", () => {
  it("keeps the branch list unframed and opens branch creation in one drawer", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

    const editor = screen.getByTestId("settings-editor");
    expect(editor.className).not.toContain("rounded-md");
    expect(editor.className).not.toContain("border border-border");
    expect(within(editor).getByText("Bangkok")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();

    const trigger = screen.getByRole("button", { name: "Add branch" });
    await user.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "Add branch" });
    expect(
      within(drawer).getByRole("textbox", { name: "Name" }),
    ).not.toBeNull();
    expect(
      within(drawer).getByRole("textbox", { name: "Code" }),
    ).not.toBeNull();
    expect(
      within(drawer).getByRole("textbox", { name: "Address" }),
    ).not.toBeNull();
    expect(within(drawer).getAllByTestId("draft-action-bar")).toHaveLength(1);
    expect(
      within(drawer).getByRole("region", { name: "Branch impact" }).dataset
        .variant,
    ).toBe("inline");
  });

  it("keeps branch consequence and actions full-width in the drawer content", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

    const drawer = await openBranchDrawer(user);
    const drawerContent = drawer.querySelector('[data-slot="drawer-content"]');
    const impact = within(drawer).getByRole("region", {
      name: "Branch impact",
    });
    const actionBar = within(drawer).getByTestId("draft-action-bar");

    expect(actionBar.closest('[data-slot="drawer-footer"]')).toBeNull();
    expect(drawerContent?.contains(impact)).toBe(true);
    expect(drawerContent?.contains(actionBar)).toBe(true);
    expect(actionBar.parentElement?.className).toContain("w-full");
  });

  it("opens one compact branch Manage drawer with exact archive consequences", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

    await user.click(screen.getByRole("button", { name: "Manage branch Bangkok" }));
    const drawer = screen.getByRole("dialog", { name: "Manage Bangkok" });

    expect((within(drawer).getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Bangkok");
    expect((within(drawer).getByRole("textbox", { name: "Code" }) as HTMLInputElement).value).toBe("BKK");
    expect(within(drawer).getByText("Archiving is blocked while this branch has assigned access, active properties, teams, person links, maintenance work, recurrence, or pending scoped records. Nothing is deleted.")).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: "Archive branch" })).not.toBeNull();
  });

  it("keeps archived branches visible and offers Restore without relabeling their scope", async () => {
    const user = userEvent.setup();
    const archivedBranch = {
      address: null,
      archivedAt: "2026-08-22T00:00:00.000Z",
      code: "OLD",
      id: "55555555-5555-4555-8555-555555555555",
      name: "Former Office",
      status: "inactive",
    };
    render(
      <SettingsWorkspace
        {...defaultProps}
        branches={[...defaultProps.branches, archivedBranch]}
        section="branches"
      />,
    );

    expect(screen.getByText("Former Office")).not.toBeNull();
    expect(screen.getByText("Archived")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Manage branch Former Office" }));
    expect(screen.getByRole("button", { name: "Restore branch" })).not.toBeNull();
  });

  it.each(["close button", "Escape", "backdrop"] as const)(
    "guards a dirty branch drawer on %s, then resets, closes, and restores its trigger",
    async (dismissal) => {
      const user = userEvent.setup();
      render(<SettingsWorkspace {...defaultProps} section="branches" />);

      const trigger = screen.getByRole("button", { name: "Add branch" });
      await user.click(trigger);
      const drawer = screen.getByRole("dialog", { name: "Add branch" });
      await user.type(
        within(drawer).getByRole("textbox", { name: "Name" }),
        "Pending branch",
      );

      if (dismissal === "close button") {
        await user.click(
          within(drawer).getByRole("button", { name: "Close drawer" }),
        );
      } else if (dismissal === "Escape") {
        await user.keyboard("{Escape}");
      } else {
        const backdrop = document.querySelector<HTMLElement>(
          "[data-slot='sheet-overlay']",
        );
        expect(backdrop).not.toBeNull();
        fireEvent.pointerDown(backdrop!, { button: 0, ctrlKey: false });
        await user.click(backdrop!);
      }

      expect(
        screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
      ).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Discard changes" }));

      expect(screen.queryByRole("dialog", { name: "Add branch" })).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(trigger));

      await user.click(trigger);
      expect(
        (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement)
          .value,
      ).toBe("");
    },
  );

  it("keeps the team list unframed and opens team creation in one drawer", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="teams" />);

    const editor = screen.getByTestId("settings-editor");
    expect(editor.className).not.toContain("rounded-md");
    expect(editor.className).not.toContain("border border-border");
    expect(within(editor).getByText("Field Operations")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.queryByRole("button", { name: /edit team/i })).toBeNull();
    const header = within(editor).getByText("Team").parentElement;
    const row = within(editor).getByText("Field Operations").parentElement;
    expect(Array.from(header?.children ?? []).map((cell) => cell.textContent)).toEqual([
      "Team",
      "Scope",
      "Manager",
      "Status",
      "Action",
    ]);
    expect(Array.from(row?.children ?? []).map((cell) => cell.textContent)).toEqual([
      "Field Operations",
      "BKK",
      "Mina Chen",
      "Active",
      "Manage",
    ]);

    const drawer = await openTeamDrawer(user);
    expect(
      within(drawer).getByRole("textbox", { name: "Name" }),
    ).not.toBeNull();
    expect(
      within(drawer).getByRole("combobox", { name: "Branch" }),
    ).not.toBeNull();
    expect(
      within(drawer).getByRole("combobox", { name: "Manager" }),
    ).not.toBeNull();

    const drawerContent = drawer.querySelector('[data-slot="drawer-content"]');
    const impact = within(drawer).getByRole("region", { name: "Team impact" });
    const actionBar = within(drawer).getByTestId("draft-action-bar");
    expect(within(drawer).getAllByTestId("draft-action-bar")).toHaveLength(1);
    expect(impact.dataset.variant).toBe("inline");
    expect(actionBar.closest('[data-slot="drawer-footer"]')).toBeNull();
    expect(drawerContent?.contains(impact)).toBe(true);
    expect(drawerContent?.contains(actionBar)).toBe(true);
    expect(actionBar.parentElement?.className).toContain("w-full");
  });

  it("shows archived branch labels for historical teams and manages a team in one drawer", async () => {
    const user = userEvent.setup();
    const archivedBranch = {
      address: null,
      archivedAt: "2026-08-22T00:00:00.000Z",
      code: "OLD",
      id: "55555555-5555-4555-8555-555555555555",
      name: "Former Office",
      status: "inactive",
    };
    const historicalTeam = {
      archivedAt: null,
      branchId: archivedBranch.id,
      id: "66666666-6666-4666-8666-666666666666",
      managerPersonId: null,
      name: "Historical Team",
    };
    render(
      <SettingsWorkspace
        {...defaultProps}
        branches={[...defaultProps.branches, archivedBranch]}
        section="teams"
        teams={[historicalTeam]}
      />,
    );

    expect(screen.getByText("OLD")).not.toBeNull();
    expect(screen.queryByText("All branches")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Manage team Historical Team" }));
    const drawer = screen.getByRole("dialog", { name: "Manage Historical Team" });
    expect((within(drawer).getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Historical Team");
    expect(within(drawer).getByRole("button", { name: "Archive team" })).not.toBeNull();
  });

  it("keeps Branch and Manager listboxes in the team drawer portal focus scope", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="teams" />);

    const drawer = await openTeamDrawer(user);
    const portalContainer = drawer.querySelector(
      '[data-slot="drawer-portals"]',
    );
    const drawerPanel = drawer.querySelector("aside");

    for (const label of ["Branch", "Manager"]) {
      await user.click(within(drawer).getByRole("combobox", { name: label }));
      const listbox = await screen.findByRole("listbox");
      expect(portalContainer?.contains(listbox)).toBe(true);
      expect(drawerPanel?.contains(listbox)).toBe(true);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(screen.getByRole("dialog", { name: "Add team" })).not.toBeNull();
    }
  });

  it.each(["close button", "Escape", "backdrop"] as const)(
    "guards a dirty team drawer on %s, then resets, closes, and restores its trigger",
    async (dismissal) => {
      const user = userEvent.setup();
      render(<SettingsWorkspace {...defaultProps} section="teams" />);

      const trigger = screen.getByRole("button", { name: "Add team" });
      await user.click(trigger);
      const drawer = screen.getByRole("dialog", { name: "Add team" });
      await user.type(
        within(drawer).getByRole("textbox", { name: "Name" }),
        "Pending team",
      );

      if (dismissal === "close button") {
        await user.click(
          within(drawer).getByRole("button", { name: "Close drawer" }),
        );
      } else if (dismissal === "Escape") {
        await user.keyboard("{Escape}");
      } else {
        const backdrop = document.querySelector<HTMLElement>(
          "[data-slot='sheet-overlay']",
        );
        expect(backdrop).not.toBeNull();
        fireEvent.pointerDown(backdrop!, { button: 0, ctrlKey: false });
        await user.click(backdrop!);
      }

      expect(
        screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
      ).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Discard changes" }));

      expect(screen.queryByRole("dialog", { name: "Add team" })).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(trigger));

      await user.click(trigger);
      expect(
        (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement)
          .value,
      ).toBe("");
    },
  );

  it("moves from clean through dirty and saving to saved with a truthful branch consequence", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message: string; status: "success" }>();
    createBranchAction.mockReturnValueOnce(pending.promise);
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

    await openBranchDrawer(user);
    const name = screen.getByRole("textbox", { name: "Name" });
    const code = screen.getByRole("textbox", { name: "Code" });
    const address = screen.getByRole("textbox", { name: "Address" });
    const save = screen.getByRole("button", { name: "Save" });

    expect(
      within(screen.getByTestId("draft-action-bar")).getByText("No changes"),
    ).not.toBeNull();
    expect(save.hasAttribute("disabled")).toBe(true);

    await user.type(name, "Chiang Mai");
    await user.type(code, "CNX");
    await user.type(address, "8 Old City Road");

    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    expect(save.hasAttribute("disabled")).toBe(false);
    const impact = screen.getByRole("region", { name: "Branch impact" });
    expect(within(impact).getByText("Nestory Test")).not.toBeNull();
    expect(within(impact).getByText("Chiang Mai (CNX)")).not.toBeNull();
    expect(within(impact).getByText("New branch only")).not.toBeNull();

    await user.click(save);
    expect(screen.getByText("Adding branch")).not.toBeNull();
    expect(createBranchAction).toHaveBeenCalledOnce();
    const submitted = createBranchAction.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("name")).toBe("Chiang Mai");
    expect(submitted.get("code")).toBe("CNX");
    expect(submitted.get("address")).toBe("8 Old City Road");

    pending.resolve({ message: "Branch added.", status: "success" });
    expect(await screen.findByText("Branch added.")).not.toBeNull();
    expect(screen.getByText("Branch saved")).not.toBeNull();
    expect((name as HTMLInputElement).value).toBe("");
    expect((code as HTMLInputElement).value).toBe("");
  });

  it("trims and uppercases the branch code in the consequence preview", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

    await openBranchDrawer(user);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), " hkt ");

    expect(
      within(screen.getByRole("region", { name: "Branch impact" })).getByText(
        "Phuket (HKT)",
      ),
    ).not.toBeNull();
  });

  it("focuses the first invalid field and keeps visible labels free of tutorial copy", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

    await openBranchDrawer(user);
    await user.type(screen.getByRole("textbox", { name: "Address" }), "A");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const name = screen.getByRole("textbox", { name: "Name" });
    expect(document.activeElement).toBe(name);
    expect(
      screen.getByText("Name must be at least 2 characters."),
    ).not.toBeNull();
    expect(screen.getByText("Name", { selector: "label" }).textContent).toBe(
      "Name",
    );
    expect(screen.queryByText(/enter your/i)).toBeNull();
    expect(screen.queryByText(/select a/i)).toBeNull();
    expect(createBranchAction).not.toHaveBeenCalled();
  });

  it("focuses one safe server-error summary, stays retryable, and clears it on success", async () => {
    const user = userEvent.setup();
    createTeamAction.mockResolvedValueOnce({
      message: "That code or team name is already in use.",
      status: "error",
    });
    createTeamAction.mockResolvedValueOnce({
      message: "Team added.",
      status: "success",
    });
    render(<SettingsWorkspace {...defaultProps} section="teams" />);

    await openTeamDrawer(user);
    const impact = screen.getByRole("region", { name: "Team impact" });
    expect(within(impact).getByText("Affected records")).not.toBeNull();
    expect(within(impact).getByText("1 team")).not.toBeNull();
    expect(within(impact).getByText("Manager link")).not.toBeNull();
    expect(within(impact).getAllByText("None")).toHaveLength(2);
    expect(within(impact).getByText("Access changes")).not.toBeNull();
    expect(within(impact).queryByText("Affected users")).toBeNull();

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.type(name, "Field Operations");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alert.textContent).toContain(
      "Team not saved: That code or team name is already in use.",
    );
    expect(document.activeElement).toBe(alert);
    expect((name as HTMLInputElement).value).toBe("Field Operations");
    expect(
      screen.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
    ).toBe(false);

    await user.type(name, " East");
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Team added.")).not.toBeNull();
    expect(screen.getByText("Team saved")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a staff manager as a link only and never implies an access mutation", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="teams" />);

    await openTeamDrawer(user);
    await user.click(screen.getByRole("combobox", { name: "Manager" }));
    await user.click(await screen.findByRole("option", { name: "Mina Chen" }));

    const impact = screen.getByRole("region", { name: "Team impact" });
    expect(within(impact).getByText("Manager link")).not.toBeNull();
    expect(within(impact).getByText("Mina Chen")).not.toBeNull();
    expect(within(impact).getByText("Access changes")).not.toBeNull();
    expect(within(impact).getByText("None")).not.toBeNull();
    expect(within(impact).queryByText(/affected users/i)).toBeNull();
    expect(
      within(impact).queryByText(/access (added|updated|removed)/i),
    ).toBeNull();
  });

  it("cancels or confirms discard without leaking the draft into another section", async () => {
    const user = userEvent.setup();
    const view = render(
      <SettingsWorkspace {...defaultProps} section="branches" />,
    );
    await openBranchDrawer(user);
    const branchName = screen.getByRole("textbox", { name: "Name" });
    await user.type(branchName, "Phuket");

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((branchName as HTMLInputElement).value).toBe("Phuket");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Discard" }),
    );

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect((branchName as HTMLInputElement).value).toBe("");
    expect(
      within(screen.getByTestId("draft-action-bar")).getByText("No changes"),
    ).not.toBeNull();

    await user.type(branchName, "Pattaya");
    view.rerender(<SettingsWorkspace {...defaultProps} section="teams" />);
    await openTeamDrawer(user);
    expect(
      (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value,
    ).toBe("");
    expect(
      within(screen.getByTestId("draft-action-bar")).getByText("No changes"),
    ).not.toBeNull();
  });

  it("ignores a stale branch result after the active section changes", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message: string; status: "success" }>();
    createBranchAction.mockReturnValueOnce(pending.promise);
    const view = render(
      <SettingsWorkspace {...defaultProps} section="branches" />,
    );

    await openBranchDrawer(user);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), "HKT");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Adding branch")).not.toBeNull();

    view.rerender(<SettingsWorkspace {...defaultProps} section="teams" />);
    pending.resolve({ message: "Branch added.", status: "success" });

    await waitFor(() => {
      expect(screen.queryByText("Branch added.")).toBeNull();
    });
    expect(screen.queryByText("Branch added.")).toBeNull();
    await openTeamDrawer(user);
    expect(
      within(screen.getByTestId("draft-action-bar")).getByText("No changes"),
    ).not.toBeNull();
  });

  it("accepts the current save result after a Strict Mode effect replay", async () => {
    const user = userEvent.setup();
    createBranchAction.mockResolvedValueOnce({
      message: "Branch added.",
      status: "success",
    });
    render(
      <StrictMode>
        <SettingsWorkspace {...defaultProps} section="branches" />
      </StrictMode>,
    );

    await openBranchDrawer(user);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), "HKT");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Branch added.")).not.toBeNull();
    expect(screen.getByText("Branch saved")).not.toBeNull();
  });

  it("blocks supported controls with a permission reason when capability is absent", async () => {
    const user = userEvent.setup();
    render(
      <SettingsWorkspace
        {...defaultProps}
        canManageStructure={false}
        section="branches"
      />,
    );

    await openBranchDrawer(user);
    const name = screen.getByRole("textbox", { name: "Name" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(name.hasAttribute("disabled")).toBe(true);
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("Only administrators can add organization structure."),
    ).not.toBeNull();

    await user.type(name, "Blocked");
    expect((name as HTMLInputElement).value).toBe("");
    expect(createBranchAction).not.toHaveBeenCalled();
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
