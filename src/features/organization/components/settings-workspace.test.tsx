/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createBranchAction, createTeamAction, navigation } = vi.hoisted(() => ({
  createBranchAction: vi.fn(),
  createTeamAction: vi.fn(),
  navigation: { push: vi.fn() },
}));

vi.mock("@/features/organization/actions", () => ({
  createBranchAction,
  createTeamAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

import { SettingsWorkspace } from "@/features/organization/components/settings-workspace";
import { OrganizationSettingsScreen } from "@/features/organization/components/organization-settings-screen";

const branches = [
  {
    address: "12 River Road",
    code: "BKK",
    id: "11111111-1111-4111-8111-111111111111",
    name: "Bangkok",
    status: "active",
  },
];

const staff = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "Mina Chen",
  },
];

const teams = [
  {
    branchId: branches[0].id,
    id: "33333333-3333-4333-8333-333333333333",
    managerPersonId: staff[0].id,
    name: "Field Operations",
  },
];

const defaultProps = {
  branches,
  canManageStructure: true,
  organizationName: "Nestory Test",
  organizationSlug: "nestory-test",
  staff,
  teams,
} as const;

beforeEach(() => {
  createBranchAction.mockReset();
  createTeamAction.mockReset();
  navigation.push.mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: {
      configurable: true,
      value: () => false,
    },
    releasePointerCapture: {
      configurable: true,
      value: () => undefined,
    },
    scrollIntoView: {
      configurable: true,
      value: () => undefined,
    },
    setPointerCapture: {
      configurable: true,
      value: () => undefined,
    },
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

describe("SettingsWorkspace navigation and layout", () => {
  it.each([
    ["organization", "Organization"],
    ["branches", "Branches"],
    ["teams", "Teams"],
  ] as const)("keeps %s URL-backed and exactly current", (section, label) => {
    render(<SettingsWorkspace {...defaultProps} section={section} />);

    const rail = screen.getByRole("navigation", {
      name: "Organization settings sections",
    });
    const links = within(rail).getAllByRole("link");
    const current = links.filter(
      (link) => link.getAttribute("aria-current") === "page",
    );

    expect(links.map((link) => link.textContent)).toEqual([
      "Organization",
      "Branches",
      "Teams",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/settings?section=organization",
      "/settings?section=branches",
      "/settings?section=teams",
    ]);
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe(label);
  });

  it("declares three wide zones, a two-zone compact layout, and mobile-safe rail", () => {
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

    const workspace = screen.getByTestId("settings-workspace");
    const rail = screen.getByRole("navigation", {
      name: "Organization settings sections",
    });

    expect(workspace.className).toContain(
      "lg:grid-cols-[180px_minmax(0,1fr)]",
    );
    expect(workspace.className).toContain(
      "xl:grid-cols-[180px_minmax(0,1fr)_300px]",
    );
    expect(workspace.className).toContain("min-w-0");
    expect(rail.className).toContain("overflow-x-auto");
    expect(screen.getByTestId("settings-editor").className).toContain("min-w-0");
    expect(screen.getByTestId("settings-summary").className).toContain(
      "lg:col-start-2",
    );
  });

  it("shows only supported organization identity without a fake edit control", () => {
    render(<SettingsWorkspace {...defaultProps} section="organization" />);

    expect(screen.getByRole("heading", { name: "Organization identity" })).not.toBeNull();
    expect(screen.getAllByText("Nestory Test")).toHaveLength(2);
    expect(screen.getByText("nestory-test")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each([
    ["branches", "Teams", "/settings?section=teams"],
    ["teams", "Branches", "/settings?section=branches"],
  ] as const)(
    "guards a dirty %s draft on a real section link and navigates once after confirmation",
    async (section, destinationLabel, destinationHref) => {
      const user = userEvent.setup();
      render(<SettingsWorkspace {...defaultProps} section={section} />);

      const name = screen.getByRole("textbox", { name: "Name" });
      const destination = screen.getByRole("link", { name: destinationLabel });
      await user.type(name, "Pending draft");
      await user.click(destination);

      expect(navigation.push).not.toHaveBeenCalled();
      expect((name as HTMLInputElement).value).toBe("Pending draft");
      expect(
        screen.getByRole("dialog", { name: `Open ${destinationLabel}?` }),
      ).not.toBeNull();
      expect(screen.getByTestId("settings-navigation-actions").className).toContain(
        "grid",
      );
      expect(
        screen
          .getByRole("button", { name: `Discard and open ${destinationLabel}` })
          .className.includes("w-full"),
      ).toBe(true);

      await user.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(
        screen.queryByRole("dialog", { name: `Open ${destinationLabel}?` }),
      ).toBeNull();
      expect(document.activeElement).toBe(destination);
      expect((name as HTMLInputElement).value).toBe("Pending draft");

      await user.click(destination);
      await user.click(
        screen.getByRole("button", { name: `Discard and open ${destinationLabel}` }),
      );

      expect(navigation.push).toHaveBeenCalledOnce();
      expect(navigation.push).toHaveBeenCalledWith(destinationHref);
      expect((name as HTMLInputElement).value).toBe("");
    },
  );

  it("keeps a clean section link as ordinary navigation without a discard prompt", async () => {
    const user = userEvent.setup();
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

    await user.click(screen.getByRole("link", { name: "Teams" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("contains forward and reverse focus, blocks the background, and restores the trigger on Escape", async () => {
    const user = userEvent.setup();
    renderSettingsScreen("branches");

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Pending");
    const destination = screen.getByRole("link", { name: "Teams" });
    const backgroundLink = screen.getByRole("link", { name: "Organization" });
    await user.click(destination);

    const dialog = screen.getByRole("dialog", { name: "Open Teams?" });
    const keepEditing = within(dialog).getByRole("button", { name: "Keep editing" });
    const discard = within(dialog).getByRole("button", {
      name: "Discard and open Teams",
    });
    const background = screen.getByTestId("settings-navigation-background");

    expect(document.activeElement).toBe(keepEditing);
    expect(background.hasAttribute("inert")).toBe(true);
    expect(background.getAttribute("aria-hidden")).toBe("true");

    await user.tab();
    expect(document.activeElement).toBe(discard);
    await user.tab();
    expect(document.activeElement).toBe(keepEditing);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(discard);

    fireEvent.click(backgroundLink);
    expect(screen.getByRole("dialog", { name: "Open Teams?" })).not.toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(destination);
    expect(background.hasAttribute("inert")).toBe(false);
    expect(background.hasAttribute("aria-hidden")).toBe(false);
  });

  it("guards the adjacent Users & Roles tab with the same draft confirmation", async () => {
    const user = userEvent.setup();
    renderSettingsScreen("branches");

    const name = screen.getByRole("textbox", { name: "Name" });
    const destination = screen.getByRole("link", { name: "Users & Roles" });
    await user.type(name, "Pending branch");
    await user.click(destination);

    expect(navigation.push).not.toHaveBeenCalled();
    expect((name as HTMLInputElement).value).toBe("Pending branch");
    expect(
      screen.getByRole("dialog", { name: "Open Users & Roles?" }),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(document.activeElement).toBe(destination);
    expect((name as HTMLInputElement).value).toBe("Pending branch");
    expect(navigation.push).not.toHaveBeenCalled();

    await user.click(destination);
    await user.click(
      screen.getByRole("button", { name: "Discard and open Users & Roles" }),
    );

    expect(navigation.push).toHaveBeenCalledOnce();
    expect(navigation.push).toHaveBeenCalledWith("/users-roles");
    expect((name as HTMLInputElement).value).toBe("");
  });

  it("keeps a clean Users & Roles tab as a native Link", async () => {
    const user = userEvent.setup();
    renderSettingsScreen("branches");

    await user.click(screen.getByRole("link", { name: "Users & Roles" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("completes one pending outer-tab navigation after an in-flight save succeeds", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message: string; status: "success" }>();
    createBranchAction.mockReturnValueOnce(pending.promise);
    renderSettingsScreen("branches");

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), "HKT");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("link", { name: "Users & Roles" }));

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
    expect(navigation.push).toHaveBeenCalledWith("/users-roles");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/save is still in progress/i)).toBeNull();
  });

  it("closes pending navigation and focuses the sole visible error after an in-flight save fails", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message: string; status: "error" }>();
    createBranchAction.mockReturnValueOnce(pending.promise);
    renderSettingsScreen("branches");

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), "HKT");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("link", { name: "Teams" }));

    pending.resolve({
      message: "That code or branch name is already in use.",
      status: "error",
    });

    const alert = await screen.findByRole("alert");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
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

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Phuket");
    await user.type(screen.getByRole("textbox", { name: "Code" }), "HKT");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(document.activeElement).toBe(alert);

    const destination = screen.getByRole("link", { name: "Users & Roles" });
    await user.click(destination);
    expect(
      screen.getByRole("dialog", { name: "Open Users & Roles?" }),
    ).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(destination);
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

describe("SettingsWorkspace drafts", () => {
  it("moves from clean through dirty and saving to saved with a truthful branch consequence", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message: string; status: "success" }>();
    createBranchAction.mockReturnValueOnce(pending.promise);
    render(<SettingsWorkspace {...defaultProps} section="branches" />);

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

    await user.type(screen.getByRole("textbox", { name: "Address" }), "A");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const name = screen.getByRole("textbox", { name: "Name" });
    expect(document.activeElement).toBe(name);
    expect(screen.getByText("Name must be at least 2 characters.")).not.toBeNull();
    expect(screen.getByText("Name", { selector: "label" }).textContent).toBe("Name");
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
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(
      false,
    );

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

    await user.click(screen.getByRole("combobox", { name: "Manager" }));
    await user.click(await screen.findByRole("option", { name: "Mina Chen" }));

    const impact = screen.getByRole("region", { name: "Team impact" });
    expect(within(impact).getByText("Manager link")).not.toBeNull();
    expect(within(impact).getByText("Mina Chen")).not.toBeNull();
    expect(within(impact).getByText("Access changes")).not.toBeNull();
    expect(within(impact).getByText("None")).not.toBeNull();
    expect(within(impact).queryByText(/affected users/i)).toBeNull();
    expect(within(impact).queryByText(/access (added|updated|removed)/i)).toBeNull();
  });

  it("cancels or confirms discard without leaking the draft into another section", async () => {
    const user = userEvent.setup();
    const view = render(<SettingsWorkspace {...defaultProps} section="branches" />);
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
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value)
      .toBe("");
    expect(
      within(screen.getByTestId("draft-action-bar")).getByText("No changes"),
    ).not.toBeNull();
  });

  it("ignores a stale branch result after the active section changes", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ message: string; status: "success" }>();
    createBranchAction.mockReturnValueOnce(pending.promise);
    const view = render(<SettingsWorkspace {...defaultProps} section="branches" />);

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

function renderSettingsScreen(section: "organization" | "branches" | "teams") {
  return render(
    <OrganizationSettingsScreen {...defaultProps} section={section} />,
  );
}
