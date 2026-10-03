/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageHelp } from "./page-help";
import { HelpTerm } from "./help-term";
import { getPageHelp, type PageHelpContent } from "./page-help-content";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspacePage } from "@/components/layout/workspace-page";

const route = vi.hoisted(() => ({ pathname: "/properties" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

afterEach(() => { cleanup(); route.pathname = "/properties"; });

describe("PageHelp", () => {
  it("explains an unfamiliar term by keyboard and returns focus on Escape", async () => {
    const user = userEvent.setup();
    render(<HelpTerm term="Ledger activity" meaning="Recorded financial entries." />);
    const trigger = screen.getByRole("button", { name: "Explain Ledger activity" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Ledger activity explained" })).toBeDefined();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("opens only on request, traps focus, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<PageHeader title="Properties" actions={<button type="button">Add property</button>} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = screen.getByRole("button", { name: "Help with this page" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Properties" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "Properties" }));
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves page form and filter values and never submits a surrounding form", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    const user = userEvent.setup();
    render(<form onSubmit={submit}><label>Search<input defaultValue="Aster" /></label><label>Draft<input defaultValue="Unsaved note" /></label><PageHelp /></form>);
    await user.click(screen.getByRole("button", { name: "Help with this page" }));
    await user.click(screen.getByRole("button", { name: "Close page help" }));
    expect((screen.getByRole("textbox", { name: "Search" }) as HTMLInputElement).value).toBe("Aster");
    expect((screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement).value).toBe("Unsaved note");
    expect(submit).not.toHaveBeenCalled();
  });

  it("closes stale help on navigation and uses the destination context", async () => {
    const user = userEvent.setup();
    const view = render(<PageHelp />);
    await user.click(screen.getByRole("button", { name: "Help with this page" }));
    route.pathname = "/units";
    view.rerender(<PageHelp />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Help with this page" }));
    expect(screen.getByRole("dialog", { name: "Units" })).toBeDefined();
  });

  it("offers deposit help without changing the route", async () => {
    route.pathname = "/leases/example";
    const user = userEvent.setup();
    render(<PageHelp />);
    await user.click(screen.getByRole("button", { name: "Help with this page" }));
    await user.click(screen.getByRole("button", { name: "Deposits" }));
    expect(screen.getByRole("dialog", { name: "Deposits" })).toBeDefined();
    expect(route.pathname).toBe("/leases/example");
    await user.click(screen.getByText("Does recording a refund send money?"));
    expect(screen.getByText(/it does not transfer money/).closest("details")?.open).toBe(true);
    expect(document.activeElement?.closest("[role=dialog]")).not.toBeNull();
  });

  it("supports explicit reporting copy through WorkspacePage and an opt-out", async () => {
    route.pathname = "/reports/unit-profit-loss";
    const content: PageHelpContent = { title: "Report owner's help", purpose: "Verified report guidance.", steps: ["Choose filters.", "Review records.", "Export."], example: "A verified example.", questions: [] };
    const user = userEvent.setup();
    const view = render(<WorkspacePage title="Report" help={content}>Report results</WorkspacePage>);
    await user.click(screen.getByRole("button", { name: "Help with this page" }));
    expect(screen.getByRole("dialog", { name: content.title })).toBeDefined();
    view.rerender(<WorkspacePage title="Report" help={false}>Report results</WorkspacePage>);
    expect(screen.queryByRole("button", { name: "Help with this page" })).toBeNull();
  });

  it("uses a bottom sheet on mobile and a side panel on desktop", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const view = render(<PageHelp />);
    await user.click(screen.getByRole("button", { name: "Help with this page" }));
    expect(screen.getByRole("dialog").getAttribute("data-side")).toBe("bottom");
    view.unmount();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    render(<PageHelp />);
    await user.click(screen.getByRole("button", { name: "Help with this page" }));
    expect(screen.getByRole("dialog").getAttribute("data-side")).toBe("right");
  });
});

describe("page help coverage", () => {
  it.each(["overview", "properties", "units", "people", "tenants", "owners", "vendors", "staff", "leases", "rent-income", "finance", "bills-expenses", "balances", "maintenance", "tasks", "recurring-tasks", "inspections", "work-orders", "reports", "settings/organization", "account", "import"])("provides three steps for /%s", (path) => {
    expect(getPageHelp(`/${path}`)?.steps).toHaveLength(3);
  });
  it("leaves reporting-specific accounting copy and unsupported routes to their owners", () => {
    expect(getPageHelp("/reports/unit-profit-loss")).toBeUndefined();
    expect(getPageHelp("/login")).toBeUndefined();
    expect(getPageHelp(null)).toBeUndefined();
  });
});
