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
import { useState } from "react";
import { SideDrawer } from "@/components/ui/side-drawer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { ModuleLoading } from "@/components/layout/module-loading";
import { BoardSurface } from "@/features/maintenance/components/maintenance-board-surface";
import { MaintenanceForm, MaintenanceScreen } from "@/features/maintenance/components/maintenance-screen";
import {
  MaintenanceWorkflowSurface,
  type MaintenanceSurfaceVariant,
} from "@/features/maintenance/components/maintenance-work-surfaces";
import type {
  MaintenanceCase,
  MaintenanceQueueCounts,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";
import { getBusinessMonthValue } from "@/lib/dates/business-date";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";

const navigation = vi.hoisted(() => ({
  pathname: "/maintenance",
  refresh: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));
const maintenanceActions = vi.hoisted(() => ({
  archive: vi.fn(async () => ({})),
  create: vi.fn(async () => ({})),
  executeAssigned: vi.fn(async () => ({})),
  executeCoordinated: vi.fn(async () => ({})),
  restore: vi.fn(async () => ({})),
  review: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
  updateStatus: vi.fn(async () => ({})),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    refresh: navigation.refresh,
    replace: navigation.replace,
  }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("@/features/maintenance/actions", () => ({
  archiveMaintenanceCaseAction: maintenanceActions.archive,
  createMaintenanceCaseAction: maintenanceActions.create,
  executeAssignedMaintenanceTaskAction: maintenanceActions.executeAssigned,
  executeCoordinatedMaintenanceTaskAction:
    maintenanceActions.executeCoordinated,
  restoreMaintenanceCaseAction: maintenanceActions.restore,
  reviewMaintenanceCompletionAction: maintenanceActions.review,
  updateMaintenanceCaseAction: maintenanceActions.update,
  updateMaintenanceStatusAction: maintenanceActions.updateStatus,
}));

const defaultViewQuery: MaintenanceViewQuery = {
  archiveState: "active",
  month: "2026-07",
  page: 1,
  pageSize: 25,
  priority: "all",
  propertyId: "all",
  query: "",
  review: "open",
  scope: "focused",
  sort: "due_asc",
  status: "all",
  taskId: "all",
  unitId: "all",
  view: "list",
};

beforeEach(() => {
  navigation.pathname = "/maintenance";
  navigation.refresh.mockReset();
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  Object.values(maintenanceActions).forEach((action) => {
    action.mockReset();
    action.mockResolvedValue({});
  });
  installMatchMedia(1440);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("maintenance workspace redesign contract", () => {
  it.each(["Cases", "Tasks", "Recurring Work", "Inspections", "Work Orders"])(
    "announces the %s loading state",
    (title) => {
      render(<ModuleLoading title={title} />);

      expect(screen.getByText(`${title} is loading`)).not.toBeNull();
    },
  );

  it.each([
    ["/maintenance", "Cases", "table"],
    ["/tasks", "My work", "board"],
    ["/recurring-tasks", "Recurring work", "routine"],
    ["/inspections", "Inspections", "checklist"],
    ["/work-orders", "Work orders", "board"],
  ] as const)(
    "shows one local maintenance navigation with %s active",
    (pathname, currentLabel, surfaceVariant) => {
      navigation.pathname = pathname;
      renderMaintenance({ surfaceVariant });

      const localNavigation = screen.getByRole("navigation", {
        name: "Maintenance workspace",
      });
      expect(
        screen.getAllByRole("navigation", { name: "Maintenance workspace" }),
      ).toHaveLength(1);
      expect(
        within(localNavigation).getByRole("button", { name: currentLabel }),
      ).not.toBeNull();
      expect(localNavigation.className).toContain("md:hidden");
    },
  );

  it("uses the shared full-width workspace anatomy without a docked Preview at 1280px", () => {
    installMatchMedia(1280);
    const { container } = renderMaintenance();

    expect(
      container.querySelector('[data-slot="workspace-page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="workspace-split-view"]'),
    ).not.toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Maintenance queue-first with collapsed filters and keyboard quick view", () => {
    renderMaintenance({
      viewQuery: {
        ...defaultViewQuery,
        month: getBusinessMonthValue(),
      },
    });

    expect(screen.getByRole("heading", { name: "Cases" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Open" })).not.toBeNull();
    expect(screen.getByRole("table")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "New case" }),
    ).not.toBeNull();

    const filters = screen.getByRole("button", { name: "Filters" });
    expect(filters.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("combobox", { name: "Priority" })).toBeNull();

    const row = within(screen.getByRole("table")).getAllByRole("row")[1]!;
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });

    expect(
      screen.getByRole("dialog", { name: "Repair sink quick view" }),
    ).not.toBeNull();
  });

  it.each([1024, 390])(
    "opens one deliberate quick-view dialog at %ipx and returns focus",
    (width) => {
      installMatchMedia(width);
      renderMaintenance();
      const row = within(screen.getByRole("table")).getAllByRole("row")[1]!;

      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(row);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(
        screen.getByRole("dialog", { name: "Repair sink quick view" }),
      ).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));
      expect(document.activeElement).toBe(row);
    },
  );

  it("returns focus to a table row after a pointer click lands on row content", () => {
    installMatchMedia(390);
    renderMaintenance();
    const row = within(screen.getByRole("table")).getAllByRole("row")[1]!;

    fireEvent.click(within(row).getByText("High"));
    fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));

    expect(document.activeElement).toBe(row);
  });

  it("replaces compact Preview with one edit drawer and returns focus to the case row", async () => {
    installMatchMedia(390);
    renderMaintenance();
    const row = within(screen.getByRole("table")).getAllByRole("row")[1]!;

    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "Edit maintenance case" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("dialog", { name: "Repair sink quick view" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(document.activeElement).toBe(row));
  }, 10_000);

  it("replaces the wide quick view while a mutation drawer opens", () => {
    installMatchMedia(1440);
    renderMaintenance();

    fireEvent.click(within(screen.getByRole("table")).getAllByRole("row")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.queryByRole("dialog", { name: "Repair sink quick view" }),
    ).toBeNull();
  });

  it("announces a drawer mutation error and keeps the recovery action available", async () => {
    maintenanceActions.archive.mockResolvedValueOnce({
      message: "The case could not be archived. Refresh and try again.",
      status: "error",
    });
    renderMaintenance();

    fireEvent.click(within(screen.getByRole("table")).getAllByRole("row")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive case" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The case could not be archived. Refresh and try again.",
    );
    expect(screen.getByRole("button", { name: "Archive case" })).not.toBeNull();
  });

  it("distinguishes filtered and true empty states with role-correct actions", () => {
    const filtered = renderMaintenance({
      cases: [],
      viewQuery: { ...defaultViewQuery, query: "missing" },
    });
    const filteredState = screen
      .getByText("No matching cases")
      .closest("section");
    expect(filteredState?.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState!).getByRole("link", { name: "Clear filters" }),
    ).not.toBeNull();
    filtered.unmount();

    renderMaintenance({ actorRole: "operations_member", cases: [] });
    const emptyState = screen.getByText("No cases yet").closest("section");
    expect(emptyState?.getAttribute("data-kind")).toBe("empty");
    expect(screen.queryByRole("button", { name: "New case" })).toBeNull();
  });

  it("preserves default status and priority when opening the grouped create form", () => {
    const { container } = render(
      <MaintenanceForm
        actor={{ dataScope: "organization", workflowMode: "coordinator" }}
        branches={[]}
        canRecordActualCost
        mode="create"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        properties={[{ id: "property-1", label: "Property One" }]}
        staff={[]}
        units={[]}
        vendors={[]}
      />,
    );

    expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
    fireEvent.click(screen.getByText("More details", { selector: "summary" }));
    expect(screen.getByRole("combobox", { name: "Priority" }).textContent).toBe("Normal");
    const form = container.querySelector("form")!;
    expect(new FormData(form).get("status")).toBe("pending");
    expect(new FormData(form).get("priority")).toBe("normal");
  });

  it("retains optional edit values and locked financial scope while disclosures are closed", async () => {
    const record = makeCase();
    record.formValues = { ...record.formValues, actualCostAmount: 75, dueTime: "09:30", reminderDate: "2026-07-17", reminderTime: "08:00", recurrenceFrequency: "monthly" };
    record.costSubmission = { status: "submitted" } as MaintenanceCase["costSubmission"];
    const { container } = renderForm(record);
    const form = container.querySelector("form")!;
    expect([...container.querySelectorAll("details")].every(details => !details.open)).toBe(true);
    const data = new FormData(form);
    for (const [name, value] of Object.entries({ propertyId: "property-1", branchId: "branch-1", assigneePersonId: "person-1", vendorPersonId: "vendor-1", actualCostAmount: "75", recurrenceFrequency: "monthly", dueTime: "09:30", reminderDate: "2026-07-17", reminderTime: "08:00", checklistText: "[ ] Check valve" })) expect(data.get(name)).toBe(value);
    const cost = form.elements.namedItem("actualCostAmount") as HTMLInputElement;
    expect(cost.readOnly).toBe(true);
    fireEvent.click(screen.getByText("More details", { selector: "summary" }));
    fireEvent.click(screen.getByText("More details", { selector: "summary" }));
    expect(new FormData(form).get("vendorPersonId")).toBe("vendor-1");
    fireEvent.click(screen.getByText("More details", { selector: "summary" }));
    await screen.findByRole("button", { name: "Reminder date" });
    expect(new FormData(form).get("reminderDate")).toBe("2026-07-17");
    expect(new FormData(form).getAll("reminderDate")).toHaveLength(1);
    expect(new FormData(form).get("dueDate")).toBe("2026-07-18");
  });

  it("reveals optional invalid controls and preserves edits after a server error", async () => {
    maintenanceActions.update.mockResolvedValueOnce({ status: "error", message: "Check the category.", fieldErrors: { category: ["Enter a category."] } } as never);
    const onClose = vi.fn();
    const { container } = renderForm(makeCase(), onClose);
    const title = screen.getByRole("textbox", { name: /What needs fixing/ });
    fireEvent.change(title, { target: { value: "New unsaved repair title" } });
    fireEvent.change(container.querySelector('[name="description"]')!, { target: { value: "Keep these unsaved notes" } });
    fireEvent.change(container.querySelector('[name="costEstimateAmount"]')!, { target: { value: "125" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByText("Enter a category.")).toBeTruthy());
    await waitFor(() => expect(container.querySelectorAll("details")[1].open).toBe(true));
    expect((title as HTMLTextAreaElement).value).toBe("New unsaved repair title");
    const failedDraft = new FormData(container.querySelector("form")!);
    expect(failedDraft.get("description")).toBe("Keep these unsaved notes");
    expect(failedDraft.get("costEstimateAmount")).toBe("125");
    expect(failedDraft.get("vendorPersonId")).toBe("vendor-1");
    expect(document.activeElement?.getAttribute("name")).toBe("category");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("retains edited unlocked actual cost after an unrelated validation error and retries the same amount", async () => {
    maintenanceActions.update
      .mockResolvedValueOnce({ status: "error", message: "Check the category.", fieldErrors: { category: ["Enter a category."] } } as never)
      .mockResolvedValueOnce({ status: "success", message: "Maintenance case saved." } as never);
    const record = makeCase();
    record.formValues.actualCostAmount = 40;
    const onClose = vi.fn();
    const { container } = renderForm(record, onClose);
    const form = container.querySelector("form")!;
    const actualCost = form.elements.namedItem("actualCostAmount") as HTMLInputElement;
    expect(actualCost.readOnly).toBe(false);
    fireEvent.click(screen.getByText("More details", { selector: "summary" }));
    fireEvent.change(actualCost, { target: { value: "125.50" } });
    fireEvent.click(screen.getByText("More details", { selector: "summary" }));
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText("Enter a category.")).toBeTruthy());
    expect(actualCost.value).toBe("125.50");
    expect(new FormData(form).get("actualCostAmount")).toBe("125.50");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.submit(form);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const calls = maintenanceActions.update.mock.calls as unknown as Array<[unknown, FormData]>;
    expect(calls).toHaveLength(2);
    expect(calls[0][1].get("actualCostAmount")).toBe("125.50");
    expect(calls[1][1].get("actualCostAmount")).toBe("125.50");
  });

  it("opens collapsed native validation without clearing its draft", () => {
    const { container } = renderForm(makeCase());
    const category = container.querySelector('[name="category"]')!;
    fireEvent.invalid(category);
    expect(category.closest("details")?.open).toBe(true);
    expect(new FormData(container.querySelector("form")!).get("title")).toBe("Repair sink");
  });

  it.each([320, 390])("keeps full long entity labels and a multiline title at %spx", (width) => {
    installMatchMedia(width);
    const long = "X".repeat(200);
    const record = makeCase(); record.formValues.title = long;
    const { container } = renderForm(record, vi.fn(), long);
    expect((screen.getByRole("textbox", { name: /What needs fixing/ }) as HTMLTextAreaElement).value).toBe(long);
    expect(container.querySelectorAll("span.whitespace-normal").length).toBeGreaterThan(0);
    expect([...container.querySelectorAll("span")].some(span => span.textContent === long && span.className.includes("overflow-wrap:anywhere"))).toBe(true);
  });

  it("keeps one primary create action for an authorized true-empty workspace", () => {
    renderMaintenance({ cases: [] });

    expect(screen.getAllByRole("button", { name: "New case" })).toHaveLength(1);
    expect(
      screen
        .getByText("No cases yet")
        .closest("section")
        ?.getAttribute("data-kind"),
    ).toBe("empty");
  });

  it.each([
    ["board", "work_orders"],
    ["calendar", "scheduled"],
  ] as const)(
    "recovers an empty derived %s view into the unfiltered case list",
    (view, review) => {
      navigation.searchParams = new URLSearchParams(
        `view=${view}&review=${review}`,
      );
      renderMaintenance({
        cases: [],
        surfaceVariant: view === "board" ? "board" : "agenda",
        viewQuery: { ...defaultViewQuery, review, view },
      });

      const emptyState = screen
        .getByText("No matching cases")
        .closest("section");
      const recoveryLink = within(emptyState!).getByRole("link", {
        name: "View all cases",
      });

      expect(recoveryLink.getAttribute("href")).toBe("/maintenance?view=list");
      expect(
        within(emptyState!).queryByRole("link", { name: "Clear filters" }),
      ).toBeNull();
    },
  );

  it("normalizes a member board request to the list control and table surface", () => {
    navigation.searchParams = new URLSearchParams(
      "view=board&review=work_orders",
    );
    renderMaintenance({
      actorRole: "operations_member",
      showCaseViewTabs: true,
      surfaceVariant: "board",
      viewQuery: { ...defaultViewQuery, review: "work_orders", view: "board" },
    });

    expect(screen.getByRole("table")).not.toBeNull();
    expect(screen.getByRole("button", { name: "List" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Board" })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Work order display" }),
    ).toBeNull();
  });

  it("keeps saved queues as lightweight task navigation with their existing URLs and labels", () => {
    const { container } = renderMaintenance({ showCaseViewTabs: true });
    const queueNavigation = screen.getByRole("navigation", {
      name: "Maintenance queues",
    });
    const expectedLinks = [
      ["Inbox 1", "/maintenance?view=list"],
      ["Review 0", "/maintenance?view=list&review=review_completion"],
      ["Overdue 0", "/maintenance?view=list&review=overdue"],
      ["Upcoming 1", "/maintenance?view=list&review=upcoming"],
      ["Completed 0", "/maintenance?view=list&review=completed"],
      ["All 1", "/maintenance?view=list&review=all"],
    ] as const;

    for (const [label, href] of expectedLinks) {
      const link = within(queueNavigation).getByRole("link", { name: label });

      expect(link.getAttribute("href")).toBe(href);
      expect(link.className).toContain("rounded-md");
    }
    expect(
      container.querySelectorAll('[data-maintenance-queue-tab="true"]'),
    ).toHaveLength(expectedLinks.length);
  });

  it("shows destination counts even when the current filtered list is empty", () => {
    navigation.searchParams = new URLSearchParams("view=list&review=all&status=completed&page=3&priority=high&query=leak");
    renderMaintenance({
      cases: [], showCaseViewTabs: true,
      queueCounts: { total: 43, open: 29, completed: 11, overdue: 12, upcoming: 17, readyForReview: 8 },
      viewQuery: { ...defaultViewQuery, review: "all", status: "completed", page: 3, priority: "high", query: "leak" },
    });
    const queues = screen.getByRole("navigation", { name: "Maintenance queues" });
    for (const [label, review] of [["All 43", "all"], ["Inbox 29", "open"], ["Completed 11", "completed"]]) {
      const href = within(queues).getByRole("link", { name: label }).getAttribute("href")!;
      const params = new URL(href, "https://fixture.test").searchParams;
      expect(params.get("review") ?? "open").toBe(review);
      expect(params.has("status")).toBe(false);
      expect(params.has("page")).toBe(false);
      expect(params.get("priority")).toBe("high");
      expect(params.get("query")).toBe("leak");
    }
  });

  it("selects Completed without intersecting the default Open queue", async () => {
    const user = userEvent.setup();
    renderMaintenance({ showCaseViewTabs: true });
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(screen.getByRole("option", { name: "Completed" }));
    const [href] = navigation.replace.mock.calls.at(-1)!;
    const params = new URL(href, "https://fixture.test").searchParams;
    expect(params.get("status")).toBe("completed");
    expect(params.get("review")).toBe("all");
    expect(params.get("view")).toBe("list");
  });

  it.each([true, false])("preserves Attention Open after a status selection (case controls: %s)", async (showCaseViewTabs) => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams("view=list&review=all&status=completed&page=3&priority=high&query=leak");
    renderMaintenance({
      showCaseViewTabs,
      viewQuery: { ...defaultViewQuery, review: "all", status: "completed", page: 3, priority: "high", query: "leak" },
    });
    if (showCaseViewTabs) await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Attention filter" }));
    await user.click(screen.getByRole("option", { name: "Open queue" }));
    const [href] = navigation.replace.mock.calls.at(-1)!;
    const params = new URL(href, "https://fixture.test").searchParams;
    expect(parseMaintenanceSearchParams(Object.fromEntries(params))).toMatchObject({
      review: "open", status: "completed", priority: "high", query: "leak", page: 1,
    });
    expect(params.get("review")).toBe("open");
  });

  it.each(["board", "calendar", "templates"] as const)("preserves explicit Attention Open on %s", async (view) => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams({ view, review: "all" });
    renderMaintenance({ showCaseViewTabs: true, viewQuery: { ...defaultViewQuery, review: "all", view } });
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Attention filter" }));
    await user.click(screen.getByRole("option", { name: "Open queue" }));
    const [href] = navigation.replace.mock.calls.at(-1)!;
    const params = new URL(href, "https://fixture.test").searchParams;
    expect(params.get("review")).toBe("open");
    expect(params.get("view")).toBe(view);
  });

  it("keeps queues separate while grouping search, filters, and view controls in one command bar", async () => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams(
      "view=board&review=work_orders",
    );
    const { container } = renderMaintenance({
      showCaseViewTabs: true,
      surfaceVariant: "board",
      viewQuery: { ...defaultViewQuery, review: "work_orders", view: "board" },
    });
    const workspaceControls = container.querySelector(
      '[data-slot="workspace-controls"]',
    );
    const commandBar = screen
      .getByRole("navigation", {
        name: "Maintenance queues",
      })
      .closest("section");

    expect(workspaceControls).not.toBeNull();
    expect(commandBar).not.toBeNull();
    expect(
      within(commandBar as HTMLElement).getByRole("textbox", {
        name: "Search cases",
      }),
    ).not.toBeNull();
    expect(
      within(commandBar as HTMLElement).getByRole("button", {
        name: /Filters/,
      }),
    ).not.toBeNull();
    const viewMenu = within(commandBar as HTMLElement).getByRole("button", {
      name: "Board",
    });
    await user.click(viewMenu);
    expect(screen.getByRole("menuitem", { name: "List" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: /Board/ })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Calendar" })).not.toBeNull();
    expect(
      screen.queryByRole("group", { name: "Work order display" }),
    ).toBeNull();
  });

  it.each([
    ["property scope", { propertyId: "property-1", unitId: "all" }],
    ["unit scope", { propertyId: "property-1", unitId: "unit-1" }],
    ["historical month", { month: "2000-01" }],
  ])("counts %s as one active advanced filter", (_label, query) => {
    renderMaintenance({
      viewQuery: {
        ...defaultViewQuery,
        month: getBusinessMonthValue(),
        ...query,
      },
    });

    expect(screen.getByRole("button", { name: "Filters 1" })).not.toBeNull();
  });

  it("does not count the List or Board display choice as an advanced filter", () => {
    renderMaintenance({
      showCaseViewTabs: true,
      surfaceVariant: "board",
      viewQuery: {
        ...defaultViewQuery,
        month: getBusinessMonthValue(),
        review: "work_orders",
        view: "board",
      },
    });

    expect(screen.getByRole("button", { name: "Filters" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Filters \(/ })).toBeNull();
  });

  it("renders the scope summary inline and removes the desktop list-table frame", () => {
    const { container } = renderMaintenance();
    const scopeSummary = container.querySelector(
      '[data-maintenance-scope-summary="true"] [data-variant]',
    );
    const tableSurface = container.querySelector(
      '[data-maintenance-surface="table"]',
    );

    expect(scopeSummary?.getAttribute("data-variant")).toBe("inline");
    expect(tableSurface?.className).toContain("md:border-0");
    expect(tableSurface?.className).toContain("md:rounded-none");
    const pagination = screen
      .getByText(
        (_content, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes("Showing") === true,
      )
      .closest("div");
    expect(pagination?.classList.contains("border-t")).toBe(true);
    expect(pagination?.classList.contains("border")).toBe(false);
    expect(pagination?.classList.contains("border-t-0")).toBe(false);
    expect(pagination?.classList.contains("rounded-b-md")).toBe(false);
    expect(pagination?.classList.contains("-mt-px")).toBe(false);
  });

  it("marks one selected maintenance row and supports Enter and Space", () => {
    renderMaintenance({
      cases: [makeCase(), makeCase("task-2", "Replace fan")],
    });
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);

    expect(
      rows.filter((row) => row.getAttribute("aria-selected") === "true"),
    ).toHaveLength(0);
    rows[1]!.focus();
    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: " " });
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps direct title links independent from table-row Preview keyboard handling", () => {
    renderMaintenance({
      cases: [makeCase(), makeCase("task-2", "Replace fan")],
    });
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const titleLink = within(rows[1]!).getByRole("link", {
      name: "Replace fan",
    });

    expect(titleLink.getAttribute("href")).toBe("/maintenance?taskId=task-2");
    fireEvent.keyDown(titleLink, { key: "Enter" });
    fireEvent.click(titleLink);
    expect(rows[0]?.getAttribute("aria-selected")).toBe("false");
    expect(rows[1]?.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it.each([
    ["table", "table", ""],
    ["board", "group", "Work order display"],
    ["agenda", "link", "Today"],
    ["checklist", "heading", "Inspection cards"],
    ["routine", "heading", "Routine plan"],
    ["inbox", "heading", "Triage inbox"],
    ["workload", "heading", "Staff workload"],
  ] as const)(
    "keeps the %s surface visible and keyboard-addressable",
    (surfaceVariant, role, accessibleName) => {
      renderMaintenance({ surfaceVariant });

      if (role === "table") {
        expect(screen.getByRole("table")).not.toBeNull();
      } else {
        expect(
          screen.getByRole(
            role,
            accessibleName ? { name: accessibleName } : undefined,
          ),
        ).not.toBeNull();
      }
    },
  );

  it("lets calendar users open the selected record Preview", () => {
    installMatchMedia(390);
    renderMaintenance({ surfaceVariant: "agenda" });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Repair sink, Pending, High, Riverside House, Pich, Rapid Repairs/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Preview" }));

    expect(
      screen.getByRole("dialog", { name: "Repair sink quick view" }),
    ).not.toBeNull();
  });

  it("gives calendar events 24px targets and restores focus from its dialog", async () => {
    const onSelect = vi.fn();
    renderWorkflowSurface("agenda", [makeCase()], onSelect);
    const eventButton = screen.getByRole("button", {
      name: /Repair sink, Pending, High, Riverside House, Pich, Rapid Repairs/,
    });

    expect(eventButton.className).toContain("min-h-6");
    expect(eventButton.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(eventButton);

    const dialog = screen.getByRole("dialog", {
      name: "Repair sink calendar event",
    });
    const directLink = within(dialog).getByRole("link", {
      name: "Repair sink",
    });
    const closeButton = within(dialog).getByRole("button", {
      name: "Close event",
    });
    expect(directLink.getAttribute("href")).toBe("/maintenance?taskId=task-1");
    expect(dialog.querySelector("button a, a button")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    fireEvent.keyDown(closeButton, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Repair sink calendar event" }),
    ).toBeNull();
    expect(document.activeElement).toBe(eventButton);

    fireEvent.click(eventButton);
    fireEvent.click(screen.getByRole("button", { name: "Close event" }));
    expect(document.activeElement).toBe(eventButton);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("discloses every hidden calendar case with direct and Preview access", async () => {
    installMatchMedia(390);
    renderMaintenance({
      cases: [
        makeCase(),
        makeCase("task-2", "Replace fan"),
        makeCase("task-3", "Check alarm"),
        makeCase("task-4", "Seal window"),
        makeCase("task-5", "Inspect boiler"),
      ],
      surfaceVariant: "agenda",
    });
    const moreButton = screen.getByRole("button", { name: "2 more" });

    expect(moreButton.className).toContain("min-h-6");
    expect(moreButton.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(moreButton);
    const disclosure = screen.getByRole("dialog", {
      name: "2 more calendar events",
    });
    const hiddenList = within(disclosure).getByRole("list", {
      name: "More calendar events",
    });
    const sealLink = within(hiddenList).getByRole("link", {
      name: "Seal window",
    });
    const boilerLink = within(hiddenList).getByRole("link", {
      name: "Inspect boiler",
    });

    expect(sealLink.getAttribute("href")).toBe("/maintenance?taskId=task-4");
    expect(boilerLink.getAttribute("href")).toBe("/maintenance?taskId=task-5");
    expect(
      within(hiddenList).getByRole("button", { name: "Preview Seal window" }),
    ).not.toBeNull();
    expect(
      within(hiddenList).getByRole("button", {
        name: "Preview Inspect boiler",
      }),
    ).not.toBeNull();
    expect(disclosure.querySelector("button a, a button")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(sealLink));

    fireEvent.click(
      within(disclosure).getByRole("button", { name: "Close events" }),
    );
    expect(document.activeElement).toBe(moreButton);

    fireEvent.click(moreButton);
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "2 more calendar events" }),
      ).getByRole("button", { name: "Preview Inspect boiler" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Inspect boiler quick view" }),
    ).not.toBeNull();
  });
});

describe("maintenance board accessible alternative", () => {
  it("keeps member work in the keyboard list without a misleading board switch", () => {
    render(
      <BoardSurface
        actorMode="assigned"
        cases={[makeCase()]}
        emptyLabel="No assigned work found."
        onSelect={vi.fn()}
        selectedTaskId="task-1"
      />,
    );

    expect(
      screen.getByRole("table", { name: "Work order list" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Board" })).toBeNull();
  });

  it("keeps an accessible List alternative when no parent view switch is supplied", async () => {
    const user = userEvent.setup();
    render(
      <BoardSurface
        actorMode="coordinator"
        cases={[makeCase()]}
        emptyLabel="No work orders found."
        onSelect={vi.fn()}
        selectedTaskId="task-1"
      />,
    );

    const listButton = screen.getByRole("button", { name: "List" });
    listButton.focus();
    await user.keyboard("{Enter}");

    const table = screen.getByRole("table", { name: "Work order list" });
    const tableSurface = table.closest(
      '[data-maintenance-surface="board-list"]',
    )!;
    expect(tableSurface.className).toBe("overflow-x-auto");
    expect(within(table).getByText("Pending")).not.toBeNull();
    expect(within(table).getByText("High")).not.toBeNull();
    expect(within(table).getByText("Pich")).not.toBeNull();
    expect(within(table).getByText("Riverside House")).not.toBeNull();
    expect(within(table).getByText("Rapid Repairs")).not.toBeNull();
    expect(listButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("separates board title navigation, Preview, and drag interactions", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <BoardSurface
        actorMode="coordinator"
        cases={[makeCase()]}
        emptyLabel="No work orders found."
        onStatusChange={vi.fn()}
        onSelect={onSelect}
        selectedTaskId="task-1"
      />,
    );
    const titleLink = screen.getByRole("link", { name: "Repair sink" });

    expect(titleLink.getAttribute("href")).toBe("/maintenance?taskId=task-1");
    fireEvent.keyDown(titleLink, { key: "Enter" });
    fireEvent.click(titleLink);
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector("button a, a button")).toBeNull();

    const previewButton = screen.getByRole("button", {
      name: "Preview Repair sink",
    });
    expect(previewButton.getAttribute("type")).toBe("button");
    previewButton.focus();
    previewButton.click();
    expect(onSelect).toHaveBeenCalledWith("task-1");
    expect(
      screen.getByRole("button", { name: "Move Repair sink" }),
    ).not.toBeNull();
  });

  it("keeps board-list direct links independent from row Preview handling", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <BoardSurface
        actorMode="coordinator"
        cases={[makeCase()]}
        emptyLabel="No work orders found."
        onSelect={onSelect}
        selectedTaskId=""
      />,
    );
    await user.click(screen.getByRole("button", { name: "List" }));
    const row = within(
      screen.getByRole("table", { name: "Work order list" }),
    ).getAllByRole("row")[1]!;
    const titleLink = within(row).getByRole("link", { name: "Repair sink" });

    expect(titleLink.getAttribute("href")).toBe("/maintenance?taskId=task-1");
    fireEvent.keyDown(titleLink, { key: "Enter" });
    fireEvent.click(titleLink);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("task-1");
  });
});

describe("maintenance record cards", () => {
  it.each(["inbox", "checklist", "routine", "workload"] as const)(
    "keeps %s title navigation independent from its Preview control",
    (variant) => {
      const onSelect = vi.fn();
      const { container } = renderWorkflowSurface(
        variant,
        [makeCase()],
        onSelect,
      );
      const titleLink = screen.getByRole("link", { name: "Repair sink" });

      expect(titleLink.getAttribute("href")).toBe("/maintenance?taskId=task-1");
      fireEvent.keyDown(titleLink, { key: "Enter" });
      fireEvent.click(titleLink);
      expect(onSelect).not.toHaveBeenCalled();
      expect(container.querySelector("button a, a button")).toBeNull();

      const previewButton = screen.getByRole("button", {
        name: "Preview Repair sink",
      });
      expect(previewButton.getAttribute("type")).toBe("button");
      previewButton.focus();
      previewButton.click();
      expect(onSelect).toHaveBeenCalledWith("task-1");
    },
  );
});

function renderMaintenance({
  actorRole = "super_admin",
  cases = [makeCase()],
  queueCounts = { total: cases.length, open: cases.length, completed: 0, overdue: 0, upcoming: cases.length, readyForReview: 0 },
  surfaceVariant = "table",
  showCaseViewTabs = false,
  viewQuery = defaultViewQuery,
}: {
  actorRole?: "super_admin" | "operations_manager" | "operations_member";
  cases?: MaintenanceCase[];
  queueCounts?: MaintenanceQueueCounts;
  surfaceVariant?: MaintenanceSurfaceVariant;
  showCaseViewTabs?: boolean;
  viewQuery?: MaintenanceViewQuery;
} = {}) {
  return render(
    <MaintenanceScreen
      actor={{
        branchId: "branch-1",
        dataScope:
          actorRole === "super_admin"
            ? "organization"
            : actorRole === "operations_member"
              ? "assigned"
              : "branch",
        personId: "person-1",
        workflowMode:
          actorRole === "operations_member" ? "assigned" : "coordinator",
      }}
      branchOptions={[]}
      capabilities={getMaintenanceCapabilities({
        isSuperAdmin: actorRole === "super_admin",
        permissionKeys: new Set(
          actorRole === "operations_manager"
            ? ["maintenance.create_assign", "maintenance.review"] as const
            : actorRole === "operations_member"
              ? ["maintenance.complete"] as const
              : [],
        ),
      })}
      cases={cases}
      createButtonLabel="New case"
      emptyLabel="No maintenance cases found."
      flowLabel="Work queue"
      listLabel="cases"
      pagination={{
        from: cases.length ? 1 : 0,
        page: 1,
        pageSize: 25,
        to: cases.length,
        totalCount: cases.length,
        totalPages: cases.length ? 1 : 0,
      }}
      propertyOptions={[{ id: "property-1", label: "Riverside House" }]}
      queueCounts={queueCounts}
      recordLabel="case"
      staffOptions={[]}
      showCaseViewTabs={showCaseViewTabs}
      summary={makeSummary(cases.length)}
      surfaceVariant={surfaceVariant}
      title="Cases"
      unitOptions={[]}
      vendorOptions={[]}
      viewQuery={viewQuery}
    />,
  );
}

function renderWorkflowSurface(
  variant: Exclude<MaintenanceSurfaceVariant, "table">,
  cases: MaintenanceCase[],
  onSelect: (taskId: string) => void,
) {
  return render(
    <MaintenanceWorkflowSurface
      actorMode="coordinator"
      cases={cases}
      emptyLabel="No maintenance cases found."
      month="2026-07"
      onSelect={onSelect}
      pagination={{
        from: cases.length ? 1 : 0,
        page: 1,
        pageSize: 25,
        to: cases.length,
        totalCount: cases.length,
        totalPages: cases.length ? 1 : 0,
      }}
      selectedTaskId=""
      variant={variant}
    />,
  );
}

function makeCase(id = "task-1", title = "Repair sink"): MaintenanceCase {
  return {
    activity: [],
    actualCostAmount: 0,
    actualCostLabel: "No actual cost",
    assigneeLabel: "Pich",
    assigneePersonId: "person-1",
    branchId: "branch-1",
    branchLabel: "Main branch",
    category: "Plumbing",
    checklist: [{ completed: false, id: "check-1", label: "Check valve" }],
    checklistDoneCount: 0,
    checklistTotalCount: 1,
    costEstimateAmount: 100,
    costEstimateLabel: "USD 100.00",
    createdAt: "2026-07-15T00:00:00Z",
    description: "Repair the kitchen sink.",
    documents: [],
    dueDate: "2026-07-18",
    dueLabel: "Due Jul 18",
    executionMode: "member_assigned",
    formValues: {
      assigneePersonId: "person-1",
      branchId: "branch-1",
      category: "Plumbing",
      checklistText: "[ ] Check valve",
      costEstimateAmount: 100,
      dueDate: "2026-07-18",
      priority: "high",
      propertyId: "property-1",
      recurrenceFrequency: "none",
      status: "pending",
      title,
      vendorPersonId: "vendor-1",
    },
    hrefs: { task: `/maintenance?taskId=${id}` },
    id,
    isArchived: false,
    isBlocked: false,
    isHighCost: false,
    isHighPriority: true,
    isOpen: true,
    isOverdue: false,
    isReminderDue: false,
    isUpcoming: true,
    priority: "high",
    priorityLabel: "High",
    priorityTone: "warning",
    progressLabel: "Pending",
    progressState: "open",
    progressTone: "neutral",
    propertyId: "property-1",
    propertyLabel: "Riverside House",
    recurrenceFrequency: "none",
    recurrenceLabel: "One-time",
    reminderLabel: "No reminder",
    requestId: `request-${id}`,
    status: "pending",
    statusLabel: "Pending",
    statusTone: "neutral",
    title,
    unitLabel: "Unit 2A",
    vendorLabel: "Rapid Repairs",
    vendorPersonId: "vendor-1",
  };
}

function makeSummary(total: number) {
  return {
    actualCostDisplay: { primary: "USD 0.00" },
    blocked: 0,
    categoryStats: [],
    completed: 0,
    estimateCostDisplay: { primary: "USD 100.00" },
    highCost: 0,
    highPriority: total,
    inProgress: 0,
    open: total,
    overdue: 0,
    pending: total,
    propertyStats: [],
    readyForReview: 0,
    recurring: 0,
    reminderDue: 0,
    repeatedIssues: [],
    scheduled: 0,
    total,
    unitStats: [],
    upcoming: total,
  };
}

function installMatchMedia(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
      const minWidth = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);

      return {
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: width >= minWidth,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      };
    }),
  });
}

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

function renderForm(record: MaintenanceCase, onClose = vi.fn(), label = "Property One") {
  return render(<MaintenanceForm actor={{ dataScope: "organization", workflowMode: "coordinator" }} branches={[{ id: "branch-1", label: "Main branch" }]} canRecordActualCost maintenanceCase={record} mode="edit" onClose={onClose} onSuccess={vi.fn()} properties={[{ id: "property-1", label }]} staff={[{ id: "person-1", branchId: "branch-1", label }]} units={[]} vendors={[{ id: "vendor-1", label }]} />);
}

describe("MaintenanceForm drawer draft safety", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open maintenance</button>{open ? <SideDrawer open title="Edit maintenance" onClose={() => setOpen(false)}><MaintenanceForm actor={{ dataScope: "organization", workflowMode: "coordinator" }} branches={[]} canRecordActualCost maintenanceCase={makeCase("guard", "Original title")} mode="edit" onClose={() => setOpen(false)} onSuccess={vi.fn()} properties={[{ id: "property-1", label: "Property One" }]} staff={[]} units={[]} vendors={[{ id: "vendor-1", label: "Vendor One" }]} /></SideDrawer> : null}</>;
  }

  async function openDrawer() {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open maintenance" }));
    return user;
  }

  it.each(["title", "description", "category", "costEstimateAmount", "actualCostAmount"])("guards edits to %s, keeps them, then discards and restores focus", async (name) => {
    const user = await openDrawer();
    const drawer = screen.getByRole("dialog", { name: "Edit maintenance" });
    const control = drawer.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    const original = control.value;
    fireEvent.input(control, { target: { value: name.includes("Amount") ? "125.50" : "changed" } });
    await user.click(within(drawer).getByRole("button", { name: "Cancel" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await user.click(within(confirmation).getByRole("button", { name: "Keep editing" }));
    expect(control.value).toBe(name.includes("Amount") ? "125.50" : "changed");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit maintenance" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open maintenance" })));
    await user.click(screen.getByRole("button", { name: "Open maintenance" }));
    expect(screen.getByRole("dialog", { name: "Edit maintenance" }).querySelector<HTMLInputElement>(`[name="${name}"]`)!.value).toBe(original);
  });

  it.each([
    ["priority", "Priority", "Low", "low"],
    ["recurrenceFrequency", "Recurrence", "Monthly", "monthly"],
    ["vendorPersonId", "Vendor", "No vendor", ""],
    ["dueTime", "Due time", "00:15", "00:15"],
    ["reminderTime", "Reminder time", "00:15", "00:15"],
  ])("guards actual %s selections", async (name, label, option, value) => {
    const user = await openDrawer();
    const drawer = screen.getByRole("dialog", { name: "Edit maintenance" });
    await user.click(within(drawer).getByText("More details", { selector: "summary" }));
    within(drawer).getByRole("combobox", { name: label }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: option }));
    await user.click(within(drawer).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(new FormData(drawer.querySelector("form")!).get(name)).toBe(value);
  });

  it("guards real checklist edits while optional sections are closed", async () => {
    const user = await openDrawer();
    const drawer = screen.getByRole("dialog", { name: "Edit maintenance" });
    await user.click(within(drawer).getByText("More details", { selector: "summary" }));
    await user.clear(within(drawer).getByPlaceholderText("Checklist item"));
    await user.type(within(drawer).getByPlaceholderText("Checklist item"), "Changed checklist");
    await user.click(within(drawer).getByText("More details", { selector: "summary" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(new FormData(drawer.querySelector("form")!).get("checklistText")).toContain("Changed checklist");
  });
  it("closes clean and reverted drafts without confirmation", async () => {
    const user = await openDrawer();
    const control = screen.getByRole("dialog", { name: "Edit maintenance" }).querySelector<HTMLTextAreaElement>('[name="title"]')!;
    fireEvent.input(control, { target: { value: "changed" } });
    fireEvent.input(control, { target: { value: "Original title" } });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Edit maintenance" })).toBeNull();
  });

  it("guards native File payloads and treats clearing the selection as reverted", async () => {
    // No upload control exists in MaintenanceForm today. Augment native FormData
    // with a synthetic attachment to exercise File serialization through the guard.
    const NativeFormData = FormData;
    let attachment = new File([], "", { type: "application/octet-stream" });
    vi.stubGlobal("FormData", class extends NativeFormData {
      constructor(form?: HTMLFormElement) {
        super(form);
        this.append("syntheticAttachment", attachment);
      }
    });
    const user = await openDrawer();
    const form = screen.getByRole("dialog", { name: "Edit maintenance" }).querySelector("form")!;
    const title = form.querySelector('[name="title"]')!;
    attachment = new File(["synthetic evidence"], "maintenance.txt", { type: "text/plain", lastModified: 1 });
    fireEvent.input(title);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((new FormData(form).get("syntheticAttachment") as File).name).toBe("maintenance.txt");
    attachment = new File([], "", { type: "application/octet-stream" });
    fireEvent.input(title);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Edit maintenance" })).toBeNull();
  });
  it("keeps the drawer open while a save is pending", async () => {
    let finish!: (value: object) => void;
    maintenanceActions.update.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const user = await openDrawer();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: "Saving is still in progress" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continue waiting" }));
    finish({ status: "success", message: "Saved." });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit maintenance" })).toBeNull());
  });
  it("retains failed saves under the guard and closes after successful retry", async () => {
    maintenanceActions.update.mockResolvedValueOnce({ status: "error", message: "Save failed." } as never).mockResolvedValueOnce({ status: "success", message: "Saved." } as never);
    const user = await openDrawer();
    const title = screen.getByRole("dialog", { name: "Edit maintenance" }).querySelector<HTMLTextAreaElement>('[name="title"]')!;
    fireEvent.input(title, { target: { value: "Retained title" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Save failed.");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(title.value).toBe("Retained title");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit maintenance" })).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});