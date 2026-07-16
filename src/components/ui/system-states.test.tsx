/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModuleLoading } from "@/components/layout/module-loading";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusNotice } from "@/components/ui/status-notice";

afterEach(cleanup);

describe("shared system states", () => {
  it.each(["dashboard", "list", "report"] as const)(
    "keeps the %s loading skeleton stable and announced",
    (kind) => {
      const { container } = render(
        <ModuleLoading kind={kind} title="Property records" />,
      );
      const state = container.querySelector(`[data-loading-kind="${kind}"]`);

      expect(state?.getAttribute("aria-busy")).toBe("true");
      expect(screen.getByRole("status").textContent).toContain(
        "Property records is loading",
      );
      expect(state?.querySelector('[data-slot="loading-header"]')).not.toBeNull();
      expect(state?.querySelector('[data-slot="loading-workspace"]')).not.toBeNull();
    },
  );

  it("gives a true empty state one useful authorized action", () => {
    render(
      <EmptyState
        action={<button type="button">Add property</button>}
        body="No property records have been added."
        kind="empty"
        title="No properties yet"
      />,
    );

    const state = screen.getByRole("status");
    expect(within(state).getByText("No property records have been added.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add property" })).not.toBeNull();
  });

  it("keeps filtered-empty context and recovery explicit", () => {
    render(
      <EmptyState
        action={<button type="button">Clear filters</button>}
        body="Status: overdue returned no rent rows."
        kind="filtered"
        title="No matching income"
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Status: overdue");
    expect(screen.getByRole("button", { name: "Clear filters" })).not.toBeNull();
  });

  it("shows a safe error cause and retry without rendering internals", () => {
    const retry = vi.fn();
    render(
      <ErrorState
        message="The property list could not be loaded."
        onRetry={retry}
        title="Properties unavailable"
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("The property list could not be loaded.");
    expect(alert.textContent).not.toMatch(/stack|postgres|supabase/i);
    screen.getByRole("button", { name: "Try again" }).click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("explains a permission boundary with a safe next step", () => {
    render(
      <StatusNotice
        action={<button type="button">Return to workspace</button>}
        message="Only workspace admins can change organization access."
        title="Admin access required"
        tone="blocked"
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Only workspace admins",
    );
    expect(screen.getByRole("button", { name: "Return to workspace" })).not.toBeNull();
  });

  it("announces success without blocking continued work", () => {
    render(
      <StatusNotice
        action={<a href="/leases/lease-1">Open lease</a>}
        message="The lease is active and rent can now be posted."
        title="Lease created"
        tone="success"
      />,
    );

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("link", { name: "Open lease" }).getAttribute("href"))
      .toBe("/leases/lease-1");
  });
});
